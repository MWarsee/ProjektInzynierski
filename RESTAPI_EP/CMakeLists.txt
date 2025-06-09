cmake_minimum_required(VERSION 3.19)
if (POLICY CMP0141)
  cmake_policy(SET CMP0141 NEW)
  set(CMAKE_MSVC_DEBUG_INFORMATION_FORMAT "$<IF:$<AND:$<C_COMPILER_ID:MSVC>,$<CXX_COMPILER_ID:MSVC>>,$<$<CONFIG:Debug,RelWithDebInfo>:EditAndContinue>,$<$<CONFIG:Debug,RelWithDebInfo>:ProgramDatabase>>")
endif()
project("RESTAPI_EP")

message(STATUS "Operating system is ${CMAKE_SYSTEM}")

set(BREEZYSLAM_C_SOURCES
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/c/coreslam.c
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/c/coreslam_armv7l.c
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/c/coreslam_i686.c
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/c/coreslam_sisd.c
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/c/random.c
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/c/ziggurat.c
)

set(BREEZYSLAM_CPP_SOURCES
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/cpp/algorithms.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/cpp/Map.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/cpp/Scan.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/cpp/WheeledRobot.cpp
)

if(CMAKE_SYSTEM_NAME MATCHES "Linux")
  message(STATUS "Current platform: Linux")
  set(LDLIDAR_DRIVER_SOURCE
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/ldlidar_driver.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/ldlidar_driver_linux.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/ldlidar_dataprocess.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/ldlidar_protocol.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/log_module.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/network_socket_interface_linux.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/serial_interface_linux.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/sl_transform.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/slbf.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/tofbf.cpp
  )
elseif(CMAKE_SYSTEM_NAME MATCHES "Windows")
  message(STATUS "Current platform: Windows")
  set(LDLIDAR_DRIVER_SOURCE
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/ldlidar_driver.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/ldlidar_driver_win.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/ldlidar_dataprocess.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/ldlidar_protocol.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/log_module.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/serial_interface_win.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/sl_transform.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/slbf.cpp
	${CMAKE_CURRENT_SOURCE_DIR}/src/ldlidar_driver/tofbf.cpp
  )
else()
  message(STATUS "Other platform: ${CMAKE_SYSTEM_NAME}")
endif()

find_package(Crow CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(Boost REQUIRED COMPONENTS asio)

add_library(breezyslam STATIC 
  ${BREEZYSLAM_C_SOURCES}
  ${BREEZYSLAM_CPP_SOURCES}
)

add_library(ldlidar_driver STATIC 
  ${LDLIDAR_DRIVER_SOURCE}
)

add_executable(RESTAPI_EP 
  "RESTAPI_EP.cpp"
)

target_include_directories(breezyslam PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/c
  ${CMAKE_CURRENT_SOURCE_DIR}/include/breezySLAM/cpp
)

target_include_directories(ldlidar_driver PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include/ldlidar_driver
)

target_include_directories(RESTAPI_EP PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(RESTAPI_EP PRIVATE 
  breezyslam
  ldlidar_driver
  nlohmann_json::nlohmann_json
  Boost::asio
)
target_link_libraries(RESTAPI_EP PUBLIC Crow::Crow)

if(CMAKE_VERSION VERSION_GREATER 3.12)
  set_property(TARGET RESTAPI_EP PROPERTY CXX_STANDARD 20)
  set_property(TARGET ldlidar_driver PROPERTY CXX_STANDARD 20)
  set_property(TARGET breezyslam PROPERTY CXX_STANDARD 20)
endif()

if(CMAKE_SYSTEM_NAME MATCHES "Linux")
  target_link_libraries(RESTAPI_EP PRIVATE pthread)
  target_link_libraries(ldlidar_driver PRIVATE pthread)
  target_link_libraries(breezyslam PRIVATE pthread)
endif()

if (NOT TARGET RESTAPI_EP)  
  message(FATAL_ERROR "Failed to create RESTAPI_EP executable.")  
endif()

get_target_property(INCLUDES RESTAPI_EP INCLUDE_DIRECTORIES)
message("Include dirs: ${INCLUDES}")