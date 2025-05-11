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

// Struktura do przechowywania informacji o w¹tku websocket
struct WebSocketThreadInfo {
    std::thread thread;
    std::atomic<bool> running{ true };
};

// Funkcja do pobierania aktualnego znacznika czasu
uint64_t GetTimestamp() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

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
	LD20 laser(0, 0); // Inicjalizacja modelu lasera
    SinglePositionSLAM* slam = (SinglePositionSLAM*)new RMHC_SLAM(laser, MAP_SIZE_PIXELS, MAP_SIZE_METERS, rand());
    ((RMHC_SLAM*)slam)->map_quality = 10;
    ((RMHC_SLAM*)slam)->hole_width_mm = 400;
    ((RMHC_SLAM*)slam)->max_search_iter = 4000;
    ((RMHC_SLAM*)slam)->sigma_xy_mm = 300;
    ((RMHC_SLAM*)slam)->sigma_theta_degrees = 45;
    // Tworzenie obiektu do obs³ugi danych z lidara
    SLAMHandler lidarHandler(lidar_drv,slam);
    lidarHandler.Start();
    std::this_thread::sleep_for(std::chrono::seconds(3)); // Czekaj na uruchomienie

    // Inicjalizacja komunikacji z Arduino
    ArduinoSerial arduino("/dev/ttyACM0", 9600);
    if (!arduino.connect()) {
        std::cerr << "Failed to connect to Arduino." << std::endl;
    }

    // Struktura do œledzenia aktywnych w¹tków websocket
    std::map<crow::websocket::connection*, std::shared_ptr<WebSocketThreadInfo>> ws_threads;
    std::mutex ws_threads_mutex;

    // Tworzenie serwera REST API
    crow::SimpleApp app;

    // Endpoint do lidara
    CROW_ROUTE(app, "/lidar/data").methods(crow::HTTPMethod::GET)([&lidarHandler]() {
        ldlidar::Points2D laser_scan_data = lidarHandler.GetLatestData();
        json response;
        response["points"] = json::array();
        for (const ldlidar::PointData& point : laser_scan_data) {
            response["points"].push_back({ {"x", point.x}, {"y", point.y} });
        }
        return crow::response(response.dump());
    });

    // Endpoint do pobierania pozycji
    CROW_ROUTE(app, "/position").methods(crow::HTTPMethod::GET)([&lidarHandler]() {
        Position position = lidarHandler.GetPosition();
        json response;
        response["x_mm"] = position.x_mm;
        response["y_mm"] = position.y_mm;
        response["theta_degrees"] = position.theta_degrees;
        return crow::response(response.dump());
    });

    // WebSocket do przesy³ania danych mapy
    CROW_WEBSOCKET_ROUTE(app, "/ws/map")
        .onopen([&](crow::websocket::connection& conn) {
        std::cout << "WebSocket map connection opened" << std::endl;
        auto thread_info = std::make_shared<WebSocketThreadInfo>();
        thread_info->thread = std::thread([&lidarHandler, &conn, thread_info]() {
            try {
                while (thread_info->running) {
                    unsigned char* map_data = lidarHandler.GetMap();
                    json response;
                    response["map"] = json::array();
                    for (unsigned int y = 0; y < MAP_SIZE_PIXELS; ++y) {
                        json row = json::array();
                        for (unsigned int x = 0; x < MAP_SIZE_PIXELS; ++x) {
                            row.push_back(map_data[y * MAP_SIZE_PIXELS + x]);
                        }
                        response["map"].push_back(row);
                    }
                    if (!thread_info->running) break;
                    conn.send_text(response.dump());
                    std::this_thread::sleep_for(std::chrono::milliseconds(500)); // Wolniejsza czêstotliwoœæ dla mapy
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


    // WebSocket do przesy³ania danych z lidara
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

    // Uruchomienie serwera na porcie 18080
    app.concurrency(1);
    app.port(18080).run();

    // Zatrzymanie websocketów
    {
        std::lock_guard<std::mutex> lock(ws_threads_mutex);
        for (auto& pair : ws_threads) {
            pair.second->running = false;
            if (pair.second->thread.joinable()) pair.second->thread.join();
        }
        ws_threads.clear();
    }

    // Zatrzymanie lidara i Arduino
    lidarHandler.Stop();
    lidar_drv->Stop();
    lidar_drv->Disconnect();
    ldlidar::LDLidarDriverLinuxInterface::Destory(lidar_drv);
    arduino.disconnect();

    return 0;
}
