#pragma once
#include "SLAMHandler.h"
#include "ArduinoSerial.h"
#include "PathFinder.h"
#include <vector>
#include <utility>
#include <memory>
#include <cmath>
#include <algorithm>
#include <set>
#include <thread>
#include <iostream>
#include <atomic>
#include <chrono>

class RobotHandler {
public:
    RobotHandler(SLAMHandler* slam, ArduinoSerial* arduino, float map_meters, int map_pixels)
        : slam_(slam), arduino_(arduino), map_meters_(map_meters), map_pixels_(map_pixels), exploring_(false) {}
    std::vector<std::pair<int, int>> planPathToGoal(const std::pair<int, int>& goal_node) {
        unsigned char* map_data = slam_->GetMap();
        auto node_grid = PathFinder::updateObstycle(map_data, map_meters_, map_pixels_);
        delete[] map_data;

        Position pos = slam_->GetPosition();
        int node_size_px = static_cast<int>(std::round(0.25f * (map_pixels_ / map_meters_)));
        int x_node = std::clamp(static_cast<int>(pos.x_mm / (map_meters_ * 1000 / map_pixels_) / node_size_px), 0, (int)node_grid.size() - 1);
        int y_node = std::clamp(static_cast<int>(pos.y_mm / (map_meters_ * 1000 / map_pixels_) / node_size_px), 0, (int)node_grid.size() - 1);

        std::pair<int, int> start_node = {x_node, y_node};
        std::cout << "[RobotHandler] planPathToGoal: start_node=(" << start_node.first << "," << start_node.second << ") goal_node=(" << goal_node.first << "," << goal_node.second << ")\n";
        auto path = PathFinder::FindPathDStarLite(node_grid, start_node, goal_node);
        std::cout << "[RobotHandler] Path size: " << path.size() << "\n";
        for (const auto& p : path) {
            std::cout << "  (" << p.first << "," << p.second << ")";
        }
        std::cout << std::endl;
        return path;
    }

    void trackPath(const std::vector<std::pair<int, int>>& path) {
        if (path.empty() || path.size() == 1) {
            std::cout << "[RobotHandler] Path is empty or trivial, nothing to track." << std::endl;
            return;
        }
        float pixels_per_meter = static_cast<float>(map_pixels_) / map_meters_;
        int node_size_px = static_cast<int>(std::round(0.25f * pixels_per_meter));
        float node_size_mm = 0.25f * 1000.0f;

        std::vector<std::pair<int, int>> current_path = path;
        size_t path_idx = 0;
        auto goal_node = path.back();
        int recalc_attempts = 0;

        unsigned char* map_data = nullptr;
        auto node_grid = std::vector<std::vector<uint8_t>>();

        auto last_map_update = std::chrono::steady_clock::now();

        while (path_idx + 1 < current_path.size()) {
            const auto& node = current_path[path_idx];
            const auto& next_node = current_path[path_idx + 1];
            bool reached = false;
            int stuck_counter = 0;
            while (!reached) {
                Position pos = slam_->GetPosition();
                int x_node = static_cast<int>(pos.x_mm / node_size_mm);
                int y_node = static_cast<int>(pos.y_mm / node_size_mm);

                auto now = std::chrono::steady_clock::now();
                if (now - last_map_update > std::chrono::seconds(1)) {
                    if (map_data) delete[] map_data;
                    map_data = slam_->GetMap();
                    node_grid = PathFinder::updateObstycle(map_data, map_meters_, map_pixels_);
                    last_map_update = now;
                }

                if (detectCollisionByScan()) {
                    std::cout << "[RobotHandler] Collision detected by scan, replanning..." << std::endl;
                    if (map_data) delete[] map_data;
                    map_data = slam_->GetMap();
                    node_grid = PathFinder::updateObstycle(map_data, map_meters_, map_pixels_);
                    auto new_path = PathFinder::FindPathDStarLite(node_grid, {x_node, y_node}, goal_node);
                    recalc_attempts++;
                    if (new_path.empty() || recalc_attempts > 5) {
                        std::cout << "[RobotHandler] Replanning failed or too many attempts, aborting." << std::endl;
                        arduino_->stop();
                        if (map_data) delete[] map_data;
                        return;
                    }
                    std::cout << "[RobotHandler] New path size: " << new_path.size() << std::endl;
                    current_path = new_path;
                    path_idx = 0;
                    break;
                }

                double dx = (next_node.first - node.first);
                double dy = (next_node.second - node.second);
                double target_angle = std::atan2(dy, dx) * 180.0 / M_PI;
                double angle_diff = target_angle - pos.theta_degrees;
                while (angle_diff > 180.0) angle_diff -= 360.0;
                while (angle_diff < -180.0) angle_diff += 360.0;

                if (std::abs(angle_diff) > 15.0) {
                    double robot_width_mm = 225.0;
                    double turn_time = arduino_->calculateTurnTime(angle_diff, robot_width_mm);
                    if (angle_diff > 0)
                        arduino_->turnLeft();
                    else
                        arduino_->turnRight();
                    std::this_thread::sleep_for(std::chrono::milliseconds(static_cast<int>(std::abs(turn_time) * 1000)));
                    arduino_->stop();
                    std::this_thread::sleep_for(std::chrono::milliseconds(200));
                    continue;
                }

                double distance = std::sqrt(dx * dx + dy * dy) * node_size_mm;
                double forward_time = arduino_->calculateForwardTime(distance);
                arduino_->forward();
                std::this_thread::sleep_for(std::chrono::milliseconds(static_cast<int>(forward_time * 1000)));
                arduino_->stop();

                std::this_thread::sleep_for(std::chrono::milliseconds(200));

                Position new_pos = slam_->GetPosition();
                int new_x_node = static_cast<int>(new_pos.x_mm / node_size_mm);
                int new_y_node = static_cast<int>(new_pos.y_mm / node_size_mm);
                if (std::abs(new_x_node - next_node.first) <= 0 && std::abs(new_y_node - next_node.second) <= 0) {
                    reached = true;
                    std::cout << "[RobotHandler] Node reached: (" << next_node.first << ", " << next_node.second << ")" << std::endl;
                    break;
                }

                if (++stuck_counter > 100) {
                    std::cout << "[RobotHandler] Stuck at node (" << node.first << ", " << node.second << "), aborting." << std::endl;
                    arduino_->stop();
                    if (map_data) delete[] map_data;
                    return;
                }
            }
            ++path_idx;
        }
        arduino_->stop();
        if (map_data) delete[] map_data;
    }

    void goToGoal(const std::pair<int, int>& goal_node) {
        auto path = planPathToGoal(goal_node);
        if (!path.empty()) {
            trackPath(path);
        }
    }

    void goToTarget(int x_pixel, int y_pixel) {
        float pixels_per_meter = static_cast<float>(map_pixels_) / map_meters_;
        int node_size_px = static_cast<int>(std::round(0.25f * pixels_per_meter));
        if (node_size_px < 1) node_size_px = 1;

        int node_x = std::clamp(x_pixel / node_size_px, 0, map_pixels_ / node_size_px - 1);
        int node_y = std::clamp(y_pixel / node_size_px, 0, map_pixels_ / node_size_px - 1);
        std::pair<int, int> goal_node = {node_x, node_y};

        auto path = planPathToGoal(goal_node);
        if (!path.empty()) {
            trackPath(path);
        }
    }

    void explore() {
        exploring_ = true;
        float pixels_per_meter = static_cast<float>(map_pixels_) / map_meters_;
        int node_size_px = static_cast<int>(std::round(0.25f * pixels_per_meter));
        float node_size_mm = 0.25f * 1000.0f; 

        while (exploring_) {
            unsigned char* map_data = slam_->GetMap();
            auto node_grid = PathFinder::updateObstycle(map_data, map_meters_, map_pixels_);
            delete[] map_data;

            Position pos = slam_->GetPosition();
            int x_node = static_cast<int>(pos.x_mm / node_size_mm);
            int y_node = static_cast<int>(pos.y_mm / node_size_mm);

            std::pair<int, int> best_node = {-1, -1};
            int min_dist = std::numeric_limits<int>::max();
            for (int y = 0; y < (int)node_grid.size(); ++y) {
                for (int x = 0; x < (int)node_grid[y].size(); ++x) {
                    if (!exploring_) break;
                    if (node_grid[y][x] == 2) {
                        int dist = std::abs(x - x_node) + std::abs(y - y_node);
                        if (dist < min_dist) {
                            min_dist = dist;
                            best_node = {x, y};
                        }
                    }
                }
                if (!exploring_) break;
            }

            if (best_node.first == -1 || !exploring_) {
                arduino_->stop();
                std::cout << "[RobotHandler] No unvisited node found, exploration finished." << std::endl;
                break;
            }
            std::cout << "[RobotHandler] Exploring to unvisited node: (" << best_node.first << "," << best_node.second << ")" << std::endl;

            auto path = PathFinder::FindPathDStarLite(node_grid, {x_node, y_node}, best_node);
            if (path.empty()) {
                continue;
            }
            trackPathWithExplorationCheck(path);
        }
        exploring_ = false;
    }

    void stopExploration() {
        exploring_ = false;
    }

    unsigned char* getMap() { return slam_->GetMap(); }
    Position getPosition() { return slam_->GetPosition(); }
    std::vector<ldlidar::PointData> getLatestScan() { return slam_->GetLatestData(); }

private:
    SLAMHandler* slam_;
    ArduinoSerial* arduino_;
    float map_meters_;
    int map_pixels_;
    std::set<std::pair<int, int>> visited_nodes{};
    std::atomic<bool> exploring_;

    void trackPathWithExplorationCheck(const std::vector<std::pair<int, int>>& path) {
        if (path.empty()) return;
        float pixels_per_meter = static_cast<float>(map_pixels_) / map_meters_;
        int node_size_px = static_cast<int>(std::round(0.25f * pixels_per_meter));
        float node_size_mm = 0.25f * 1000.0f; 

        std::vector<std::pair<int, int>> current_path = path;
        size_t path_idx = 0;
        auto goal_node = path.back();
        int recalc_attempts = 0;

        unsigned char* map_data = nullptr;
        auto node_grid = std::vector<std::vector<uint8_t>>();

        auto last_map_update = std::chrono::steady_clock::now();

        while (path_idx < current_path.size() && exploring_) {
            const auto& node = current_path[path_idx];
            bool reached = false;
            int stuck_counter = 0;
            while (!reached && exploring_) {
                Position pos = slam_->GetPosition();
                int x_node = static_cast<int>(pos.x_mm / node_size_mm);
                int y_node = static_cast<int>(pos.y_mm / node_size_mm);

                auto now = std::chrono::steady_clock::now();
                if (now - last_map_update > std::chrono::seconds(1)) {
                    if (map_data) delete[] map_data;
                    map_data = slam_->GetMap();
                    node_grid = PathFinder::updateObstycle(map_data, map_meters_, map_pixels_);
                    last_map_update = now;
                }

                if (detectCollisionByScan()) {
                    std::cout << "[RobotHandler] Collision detected by scan, replanning..." << std::endl;
                    if (map_data) delete[] map_data;
                    map_data = slam_->GetMap();
                    node_grid = PathFinder::updateObstycle(map_data, map_meters_, map_pixels_);
                    auto new_path = PathFinder::FindPathDStarLite(node_grid, {x_node, y_node}, goal_node);
                    recalc_attempts++;
                    if (new_path.empty() || recalc_attempts > 5) {
                        std::cout << "[RobotHandler] Replanning failed or too many attempts, aborting." << std::endl;
                        arduino_->stop();
                        if (map_data) delete[] map_data;
                        return;
                    }
                    std::cout << "[RobotHandler] New path size: " << new_path.size() << std::endl;
                    current_path = new_path;
                    path_idx = 0;
                    continue;
                }

                if (std::abs(x_node - node.first) <= 0 && std::abs(y_node - node.second) <= 0) {
                    reached = true;
                    arduino_->stop();
                    break;
                }

                int dx = node.first - x_node;
                int dy = node.second - y_node;

                double angle_to_target = std::atan2(dy, dx) * 180.0 / M_PI;
                double angle_diff = angle_to_target - pos.theta_degrees;
                while (angle_diff > 180.0) angle_diff -= 360.0;
                while (angle_diff < -180.0) angle_diff += 360.0;

                if (std::abs(angle_diff) < 20.0) {
                    arduino_->forward();
                } else if (angle_diff > 0) {
                    arduino_->turnLeft();
                } else {
                    arduino_->turnRight();
                }

                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                if (++stuck_counter > 100) {
                    arduino_->stop();
                    if (map_data) delete[] map_data;
                    break;
                }
            }
            if (!exploring_) {
                arduino_->stop();
                if (map_data) delete[] map_data;
                break;
            }
            ++path_idx;
        }
        arduino_->stop();
    }

    bool detectCollision(const std::vector<std::vector<uint8_t>>& node_grid, int x_node, int y_node) {
        if (y_node < 0 || y_node >= (int)node_grid.size() || x_node < 0 || x_node >= (int)node_grid[0].size())
            return false;
        return node_grid[y_node][x_node] == 1;
    }

    bool detectCollisionByScan() {
        Position pos = slam_->GetPosition();
        auto scan = slam_->GetLatestData();
        for (const auto& pt : scan) {
            double dx = pt.x - pos.x_mm;
            double dy = pt.y - pos.y_mm;
            double dist = std::sqrt(dx * dx + dy * dy);
            if (dist < 250.0) {
                std::cout << "[RobotHandler] Collision detected by scan: dist=" << dist << "mm" << std::endl;
                return true;
            }
        }
        return false;
    }
};
