#pragma once
#include <vector>
#include <queue>
#include <limits>
#include <cmath>
#include <cstdint>
#include <unordered_map>
#include <tuple>
#include <functional>
#include <set>

struct pair_hash {
    std::size_t operator()(const std::pair<int, int>& p) const {
        return (std::hash<int>()(p.first) << 1) ^ std::hash<int>()(p.second);
    }
};

class PathFinder {
public:
    static std::vector<std::vector<uint8_t>> ConvertMapToGrid(const unsigned char* map_data, int width, int height, uint8_t threshold = 250) {
        std::vector<std::vector<uint8_t>> grid(height, std::vector<uint8_t>(width, 0));
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                grid[y][x] = (map_data[y * width + x] > threshold) ? 1 : 0;
            }
        }
        return grid;
    }
    static std::vector<std::vector<uint8_t>> updateObstycle(
        const unsigned char* map_data,
        float map_meters,
        int map_pixels
    ) {
        float pixels_per_meter = static_cast<float>(map_pixels) / map_meters;
        int node_size_px = static_cast<int>(std::round(0.25f * pixels_per_meter));
        if (node_size_px < 1) node_size_px = 1;

        int nodes_per_side = static_cast<int>(std::ceil(static_cast<float>(map_pixels) / node_size_px));
        std::vector<std::vector<uint8_t>> node_grid(nodes_per_side, std::vector<uint8_t>(nodes_per_side, 0));

        for (int ny = 0; ny < nodes_per_side; ++ny) {
            for (int nx = 0; nx < nodes_per_side; ++nx) {
                int y_start = ny * node_size_px;
                int y_end = std::min((ny + 1) * node_size_px, map_pixels);
                int x_start = nx * node_size_px;
                int x_end = std::min((nx + 1) * node_size_px, map_pixels);

                int sum = 0;
                int count = 0;
                for (int py = y_start; py < y_end; ++py) {
                    for (int px = x_start; px < x_end; ++px) {
                        sum += map_data[py * map_pixels + px];
                        ++count;
                    }
                }
                double avg = (count > 0) ? (double)sum / count : 255.0;

                if (avg > 200.0) {
                    node_grid[ny][nx] = 0;
                } else if (avg < 25.0) {
                    node_grid[ny][nx] = 1;
                } else {
                    node_grid[ny][nx] = 2;
                }
            }
        }
        return node_grid;
    }

    static std::vector<std::pair<int, int>> FindPathDStarLite(
        const std::vector<std::vector<uint8_t>>& grid,
        std::pair<int, int> start,
        std::pair<int, int> goal
    ) {
        if (grid.empty() || grid[0].empty()) return {};
        int h = grid.size(), w = grid[0].size();
        if (start.first < 0 || start.second < 0 || start.first >= w || start.second >= h) return {};
        if (goal.first < 0 || goal.second < 0 || goal.first >= w || goal.second >= h) return {};
        DStarLite dstar(grid, start, goal);
        return dstar.run();
    }

private:
    class DStarLite {
    public:
        DStarLite(const std::vector<std::vector<uint8_t>>& grid, std::pair<int, int> start, std::pair<int, int> goal)
            : grid_(grid), width_(grid[0].size()), height_(grid.size()), start_(start), goal_(goal), km_(0.0f)
        {
            for (int y = 0; y < height_; ++y) {
                for (int x = 0; x < width_; ++x) {
                    g_[{x, y}] = std::numeric_limits<float>::infinity();
                    rhs_[{x, y}] = std::numeric_limits<float>::infinity();
                    cost_[{x, y}] = (grid[y][x] == 1) ? std::numeric_limits<float>::infinity() : 1.0f;
                }
            }
            rhs_[goal_] = 0.0f;
            insertOpen(goal_);
        }

        std::vector<std::pair<int, int>> run() {
            computeShortestPath();
            std::vector<std::pair<int, int>> path;
            auto s = start_;
            if (g_[s] == std::numeric_limits<float>::infinity()) return {};
            if (s == goal_) return {s};
            path.push_back(s);
            while (s != goal_) {
                auto nbrs = getNeighbors(s);
                float min_cost = std::numeric_limits<float>::infinity();
                std::pair<int, int> next = s;
                for (auto& n : nbrs) {
                    float c = cost_[n] + g_[n];
                    if (c < min_cost) {
                        min_cost = c;
                        next = n;
                    }
                }
                if (next == s) break;
                s = next;
                path.push_back(s);
            }
            if (path.size() <= 1) return {};
            return path;
        }

        void updateNodeCost(const std::pair<int, int>& node, float new_cost) {
            cost_[node] = new_cost;
            updateVertex(node);
        }

    private:
        const std::vector<std::vector<uint8_t>>& grid_;
        int width_, height_;
        std::pair<int, int> start_, goal_;
        float km_;

        std::unordered_map<std::pair<int, int>, float, pair_hash> g_;
        std::unordered_map<std::pair<int, int>, float, pair_hash> rhs_;
        std::unordered_map<std::pair<int, int>, float, pair_hash> cost_;

        using QueueElem = std::pair<std::pair<float, float>, std::pair<int, int>>;
        struct QueueCompare {
            bool operator()(const QueueElem& a, const QueueElem& b) const {
                if (a.first.first != b.first.first)
                    return a.first.first > b.first.first;
                return a.first.second > b.first.second;
            }
        };
        std::priority_queue<QueueElem, std::vector<QueueElem>, QueueCompare> openList_;
        std::set<std::pair<int, int>, std::less<>> openSet_; // for fast lookup/removal

        float heuristic(const std::pair<int, int>& a, const std::pair<int, int>& b) const {
            return std::abs(a.first - b.first) + std::abs(a.second - b.second);
        }

        std::pair<float, float> calculateKey(const std::pair<int, int>& s) const {
            float g_rhs = std::min(g_.at(s), rhs_.at(s));
            return {g_rhs + heuristic(start_, s) + km_, g_rhs};
        }

        std::vector<std::pair<int, int>> getNeighbors(const std::pair<int, int>& s) const {
            static const int dx[4] = {1, -1, 0, 0};
            static const int dy[4] = {0, 0, 1, -1};
            std::vector<std::pair<int, int>> nbrs;
            for (int i = 0; i < 4; ++i) {
                int nx = s.first + dx[i];
                int ny = s.second + dy[i];
                if (nx >= 0 && nx < width_ && ny >= 0 && ny < height_) {
                    if (cost_.at({nx, ny}) < std::numeric_limits<float>::infinity()) {
                        nbrs.emplace_back(nx, ny);
                    }
                }
            }
            return nbrs;
        }

        void removeOpen(const std::pair<int, int>& u) {
            openSet_.erase(u);
        }

        void insertOpen(const std::pair<int, int>& u) {
            openList_.push({calculateKey(u), u});
            openSet_.insert(u);
        }

        void updateVertex(const std::pair<int, int>& u) {
            if (u != goal_) {
                float min_rhs = std::numeric_limits<float>::infinity();
                for (auto& s : getNeighbors(u)) {
                    min_rhs = std::min(min_rhs, cost_.at(u) + g_.at(s));
                }
                rhs_[u] = min_rhs;
            }
            if (openSet_.count(u)) removeOpen(u);
            if (g_[u] != rhs_[u]) insertOpen(u);
        }

        void computeShortestPath() {
            while (!openList_.empty()) {
                auto [k_old, u] = openList_.top();
                if (!openSet_.count(u)) { openList_.pop(); continue; }
                auto k_start = calculateKey(start_);
                if (!(k_old < k_start) && rhs_[start_] == g_[start_]) break;

                auto k_new = calculateKey(u);
                if (k_old < k_new) {
                    openList_.pop();
                    insertOpen(u);
                } else if (g_[u] > rhs_[u]) {
                    g_[u] = rhs_[u];
                    openList_.pop();
                    openSet_.erase(u);
                    for (auto& s : getNeighbors(u)) updateVertex(s);
                } else {
                    g_[u] = std::numeric_limits<float>::infinity();
                    openList_.pop();
                    openSet_.erase(u);
                    updateVertex(u);
                    for (auto& s : getNeighbors(u)) updateVertex(s);
                }
            }
        }
    };
};
