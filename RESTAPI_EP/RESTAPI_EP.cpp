#include <crow.h>
#include <nlohmann/json.hpp>
#include "ldlidar_driver/ldlidar_driver_linux.h"
#include <SLAMHandler.h>
#include <chrono>
#include <iostream>
#include <thread>
#include <atomic>
#include <mutex>
#include <map>
#include <ArduinoSerial.h>
#include "RobotHandler.h"

#include "breezySLAM/cpp/algorithms.hpp"
#include "breezySLAM/cpp/Laser.hpp"
#include "breezySLAM/cpp/PoseChange.hpp"
#include "breezySLAM/cpp/Position.hpp"

static const int MAP_SIZE_PIXELS = 800;
static const double MAP_SIZE_METERS = 15;

using json = nlohmann::json;

int coords2index(double x, double y)
{
    return y * MAP_SIZE_PIXELS + x;
}

int mm2pix(double mm)
{
    return (int)(mm / (MAP_SIZE_METERS * 1000. / MAP_SIZE_PIXELS));
}

struct WebSocketThreadInfo {
    std::thread thread;
    std::atomic<bool> running{ true };
};

uint64_t GetTimestamp() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

enum class RobotMode { MANUAL, EXPLORE };
std::atomic<RobotMode> robot_mode{RobotMode::MANUAL};

int main() {
    
    ldlidar::LDLidarDriverLinuxInterface* lidar_drv = ldlidar::LDLidarDriverLinuxInterface::Create();
    lidar_drv->RegisterGetTimestampFunctional(std::bind(&GetTimestamp));
    lidar_drv->EnablePointCloudDataFilter(true);
    if (!lidar_drv->Connect(ldlidar::LDType::LD_20, "/dev/ttyUSB0", 230400)) {
        std::cerr << "Failed to connect to lidar." << std::endl;
        return -1;
    }
    if (!lidar_drv->Start()) {
        std::cerr << "Failed to start lidar." << std::endl;
        return -1;
    }
	LD20 ld20_lidar(4,45); 
    SinglePositionSLAM* slam = (SinglePositionSLAM*)
        new RMHC_SLAM(ld20_lidar, MAP_SIZE_PIXELS, MAP_SIZE_METERS, 125);
    ((RMHC_SLAM*)slam)->map_quality = 5;
    ((RMHC_SLAM*)slam)->hole_width_mm = 400;
    ((RMHC_SLAM*)slam)->max_search_iter = 2000;
    ((RMHC_SLAM*)slam)->sigma_xy_mm = 250;
    ((RMHC_SLAM*)slam)->sigma_theta_degrees = 60;
    SLAMHandler lidarHandler(lidar_drv,slam);
    lidarHandler.Start();
    std::this_thread::sleep_for(std::chrono::seconds(3)); 

    ArduinoSerial arduino("/dev/ttyACM0", 9600);
    if (!arduino.connect()) {
        std::cerr << "Failed to connect to Arduino." << std::endl;
    }

    RobotHandler robotHandler(&lidarHandler, &arduino, MAP_SIZE_METERS, MAP_SIZE_PIXELS);

    std::map<crow::websocket::connection*, std::shared_ptr<WebSocketThreadInfo>> ws_threads;
    std::mutex ws_threads_mutex;

    crow::SimpleApp app;

    CROW_ROUTE(app, "/lidar/data").methods(crow::HTTPMethod::GET)([&lidarHandler]() {
        ldlidar::Points2D laser_scan_data = lidarHandler.GetLatestData();
        json response;
        response["points"] = json::array();
        for (const ldlidar::PointData& point : laser_scan_data) {
            response["points"].push_back({ {"x", point.x}, {"y", point.y} });
        }
        return crow::response(response.dump());
    });

    CROW_ROUTE(app, "/robot/position").methods(crow::HTTPMethod::GET)([&lidarHandler]() {
        Position position = lidarHandler.GetPosition();
        json response;
        response["x_mm"] = position.x_mm;
        response["y_mm"] = position.y_mm;
        response["theta_degrees"] = position.theta_degrees;
        return crow::response(response.dump());
    });

    CROW_WEBSOCKET_ROUTE(app, "/ws/map")
        .onopen([&](crow::websocket::connection& conn) {
        std::cout << "WebSocket map connection opened" << std::endl;
        auto thread_info = std::make_shared<WebSocketThreadInfo>();
        thread_info->thread = std::thread([&lidarHandler, &conn, thread_info]() {
            try {
                while (thread_info->running) {
                    unsigned char* map_data = lidarHandler.GetMap();
                    Position position = lidarHandler.GetPosition();

                    int x_pixel = mm2pix(position.x_mm);
                    int y_pixel = mm2pix(position.y_mm);

                    json response;
                    response["map"] = json::array();
                    for (unsigned int y = 0; y < MAP_SIZE_PIXELS; ++y) {
                        json row = json::array();
                        for (unsigned int x = 0; x < MAP_SIZE_PIXELS; ++x) {
                            row.push_back(map_data[y * MAP_SIZE_PIXELS + x]);
                        }
                        response["map"].push_back(row);
                    }

                    response["position"] = {
                        {"x_pixel", x_pixel},
                        {"y_pixel", y_pixel},
                        {"theta_degrees", position.theta_degrees}
                    };

                    if (!thread_info->running) break;
                    conn.send_text(response.dump());
                    std::this_thread::sleep_for(std::chrono::milliseconds(500));
                }
            }
            catch (const std::exception& e) {
                std::cout << "WebSocket map error: " << e.what() << std::endl;
            }
            std::cout << "WebSocket map thread terminated" << std::endl;
            });
        std::lock_guard<std::mutex> lock(ws_threads_mutex);
        ws_threads[&conn] = thread_info;
            })
        .onclose([&](crow::websocket::connection& conn, const std::string& reason) {
        std::cout << "WebSocket map closed: " << reason << std::endl;
        std::lock_guard<std::mutex> lock(ws_threads_mutex);
        auto it = ws_threads.find(&conn);
        if (it != ws_threads.end()) {
            it->second->running = false;
            if (it->second->thread.joinable()) it->second->thread.join();
            ws_threads.erase(it);
        }
            })
        .onmessage([](crow::websocket::connection& conn, const std::string& msg, bool is_binary) {
        std::cout << "Received message from map client: " << msg << std::endl;
            });

    CROW_ROUTE(app, "/arduino/send").methods(crow::HTTPMethod::POST)(
        [&arduino](const crow::request& req) {
            if (robot_mode != RobotMode::MANUAL) {
                return crow::response(403, R"({"status":"error","reason":"Not in manual mode"})");
            }
            try {
                auto body = json::parse(req.body);
                std::string cmd = body["data"];
                arduino.send(cmd);
                return crow::response(200, R"({"status":"ok"})");
            }
            catch (...) {
                return crow::response(400, R"({"status":"error","reason":"invalid JSON"})");
            }
        });

    CROW_ROUTE(app, "/robot/target").methods(crow::HTTPMethod::POST)(
        [&robotHandler](const crow::request& req) {
            if (robot_mode != RobotMode::MANUAL) {
                return crow::response(403, R"({"status":"error","reason":"Not in manual mode"})");
            }
            try {
                auto body = json::parse(req.body);
                int x_pixel = body.at("x_pixel");
                int y_pixel = body.at("y_pixel");
                std::cout << "[REST] Received /robot/target: x_pixel=" << x_pixel << " y_pixel=" << y_pixel << std::endl;
                std::thread([&robotHandler, x_pixel, y_pixel]() {
                    std::cout << "[REST] Calling robotHandler.goToTarget..." << std::endl;
                    robotHandler.goToTarget(x_pixel, y_pixel);
                    std::cout << "[REST] robotHandler.goToTarget finished." << std::endl;
                }).detach();
                return crow::response(200, R"({"status":"ok","msg":"Target received"})");
            }
            catch (const std::exception& e) {
                std::cout << "[REST] Error in /robot/target: " << e.what() << std::endl;
                return crow::response(400, std::string(R"({"status":"error","reason":")") + e.what() + "\"}");
            }
        });

    CROW_ROUTE(app, "/robot/mode").methods(crow::HTTPMethod::POST)(
        [&robotHandler](const crow::request& req) {
            try {
                auto body = json::parse(req.body);
                std::string mode = body.at("mode");
                if (mode == "manual") {
                    robotHandler.stopExploration(); 
                    robot_mode = RobotMode::MANUAL;
                    return crow::response(200, R"({"status":"ok","mode":"manual"})");
                } else if (mode == "explore") {
                    robot_mode = RobotMode::EXPLORE;
                    std::thread([&robotHandler]() {
                        robotHandler.explore();
                        robot_mode = RobotMode::MANUAL;
                    }).detach();
                    return crow::response(200, R"({"status":"ok","mode":"explore"})");
                } else {
                    return crow::response(400, R"({"status":"error","reason":"Invalid mode"})");
                }
            } catch (const std::exception& e) {
                return crow::response(400, std::string(R"({"status":"error","reason":")") + e.what() + "\"}");
            }
        });

    CROW_WEBSOCKET_ROUTE(app, "/ws/lidar")
        .onopen([&](crow::websocket::connection& conn) {
        std::cout << "WebSocket connection opened" << std::endl;
        auto thread_info = std::make_shared<WebSocketThreadInfo>();
        thread_info->thread = std::thread([&lidarHandler, &conn, thread_info]() {
            try {
                while (thread_info->running) {
                    ldlidar::Points2D data = lidarHandler.GetLatestData();
                    json response;
                    response["points"] = json::array();
                    for (const auto& point : data) {
                        response["points"].push_back({ {"x", point.x}, {"y", point.y} });
                    }
                    if (!thread_info->running) break;
                    conn.send_text(response.dump());
                    std::this_thread::sleep_for(std::chrono::milliseconds(166));
                }
            }
            catch (const std::exception& e) {
                std::cout << "WebSocket error: " << e.what() << std::endl;
            }
            std::cout << "WebSocket thread terminated" << std::endl;
            });
        std::lock_guard<std::mutex> lock(ws_threads_mutex);
        ws_threads[&conn] = thread_info;
            })
        .onclose([&](crow::websocket::connection& conn, const std::string& reason) {
        std::cout << "WebSocket closed: " << reason << std::endl;
        std::lock_guard<std::mutex> lock(ws_threads_mutex);
        auto it = ws_threads.find(&conn);
        if (it != ws_threads.end()) {
            it->second->running = false;
            if (it->second->thread.joinable()) it->second->thread.join();
            ws_threads.erase(it);
        }
            })
        .onmessage([](crow::websocket::connection& conn, const std::string& msg, bool is_binary) {
        std::cout << "Received message from client: " << msg << std::endl;
            });

    app.port(18080).run();

    {
        std::lock_guard<std::mutex> lock(ws_threads_mutex);
        for (auto& pair : ws_threads) {
            pair.second->running = false;
            if (pair.second->thread.joinable()) pair.second->thread.join();
        }
        ws_threads.clear();
    }
    
    lidarHandler.Stop();
    lidar_drv->Stop();
    lidar_drv->Disconnect();
    ldlidar::LDLidarDriverLinuxInterface::Destory(lidar_drv);
    arduino.disconnect();

    return 0;
}
