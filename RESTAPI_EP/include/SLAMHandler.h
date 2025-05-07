#pragma once
#include "ldlidar_driver/ldlidar_driver_linux.h"
#include <atomic>
#include <mutex>
#include <thread>
#include <vector>
#include "breezySLAM/cpp/algorithms.hpp"

class SLAMHandler {
public:
    SLAMHandler(ldlidar::LDLidarDriverLinuxInterface* lidarDriver, SinglePositionSLAM* slam, unsigned int map_size = 1000)
		: lidarDriver_(lidarDriver), isRunning_(false), slam_(slam), map_size_(map_size)
    {}

    ~SLAMHandler() {
        Stop();
    }

    void Start() {
        if (isRunning_) return;

        isRunning_ = true;
        lidarThread_ = std::thread(&SLAMHandler::Run, this);
    }

    void Stop() {
        if (!isRunning_) return;

        isRunning_ = false;
        if (lidarThread_.joinable()) {
            lidarThread_.join();
        }
    }

    std::vector<ldlidar::PointData> GetLatestData() {
        std::lock_guard<std::mutex> lock(dataMutex_);
        return laserScanPoints_;
    }

	unsigned char* GetMap() {
		std::lock_guard<std::mutex> lock(dataMutex_);
		unsigned char* mapbytes = new unsigned char[map_size_ * map_size_];
        slam_->getmap(mapbytes);
        return mapbytes;
	}

	Position GetPosition() {
		std::lock_guard<std::mutex> lock(dataMutex_);
		return slam_->getpos();
	}

private:
    void Run() {
       ldlidar::Points2D laserScanPoints;
       while (isRunning_ && ldlidar::LDLidarDriverLinuxInterface::Ok()) {
           switch (lidarDriver_->GetLaserScanData(laserScanPoints, 2000)) {
           case ldlidar::LidarStatus::NORMAL: 
           {
               std::lock_guard<std::mutex> lock(dataMutex_);
               laserScanPoints_ = laserScanPoints;

               // Convert laserScanPoints to an array of distances (int*)
               std::vector<int> distances;
               distances.reserve(laserScanPoints.size());
               for (const auto& point : laserScanPoints) {
                   distances.push_back(static_cast<int>(point.distance));
               }

               slam_->update(distances.data());
               break;
           }
           case ldlidar::LidarStatus::DATA_TIME_OUT: 
           {
               LOG_ERROR_LITE("Point cloud data timeout. Check your lidar device.", "");
               lidarDriver_->Stop();
               break;
           }
           case ldlidar::LidarStatus::DATA_WAIT:
               break;
           default:
               break;
           }
           std::this_thread::sleep_for(std::chrono::milliseconds(166)); // 6Hz
       }
    }

    ldlidar::LDLidarDriverLinuxInterface* lidarDriver_;
    std::atomic<bool> isRunning_;
    std::thread lidarThread_;
    std::mutex dataMutex_;
    std::vector<ldlidar::PointData> laserScanPoints_;
	SinglePositionSLAM* slam_;
	unsigned int map_size_; 
};
