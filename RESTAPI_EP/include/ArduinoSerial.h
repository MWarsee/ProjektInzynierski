#pragma once
#include <boost/asio.hpp>
#include <iostream>
#include <string>
#include <cmath>

class ArduinoSerial {
public:
    ArduinoSerial(const std::string& port, unsigned int baudrate)
        : io_(), serial_(io_), port_name_(port), baudrate_(baudrate),
          wheel_diameter_mm_(60.0), rpm_(100) // default: 65mm wheel, 60 obr/min
    {
    }

    ~ArduinoSerial() {
        disconnect();
    }

    bool connect() {
        boost::system::error_code ec;
        serial_.open(port_name_, ec);
        if (ec) {
            std::cerr << "B³¹d otwierania portu: " << ec.message() << std::endl;
            return false;
        }

        serial_.set_option(boost::asio::serial_port_base::baud_rate(baudrate_));
        serial_.set_option(boost::asio::serial_port_base::character_size(8));
        serial_.set_option(boost::asio::serial_port_base::parity(boost::asio::serial_port_base::parity::none));
        serial_.set_option(boost::asio::serial_port_base::stop_bits(boost::asio::serial_port_base::stop_bits::one));
        serial_.set_option(boost::asio::serial_port_base::flow_control(boost::asio::serial_port_base::flow_control::none));

        return true;
    }

    bool send(const std::string& data) {
        std::cout << "[ArduinoSerial] send: " << data;
        if (!serial_.is_open()) return false;

        std::string msg = data + "\n";
        boost::system::error_code ec;
        boost::asio::write(serial_, boost::asio::buffer(msg), ec);
        if (ec) {
            std::cerr << "B³¹d podczas wysy³ania: " << ec.message() << std::endl;
            std::cerr << "[ArduinoSerial] send failed!" << std::endl;
            return false;
        }
        return true;
    }

    std::string receive() {
        if (!serial_.is_open()) return "";

        std::string response;
        char c;
        boost::system::error_code ec;

        while (true) {
            boost::asio::read(serial_, boost::asio::buffer(&c, 1), ec);
            if (ec) {
                std::cerr << "B³¹d podczas odbioru: " << ec.message() << std::endl;
                break;
            }
            if (c == '\n') break;
            response += c;
        }

        return response;
    }

    void disconnect() {
        if (serial_.is_open()) {
			stop();
            serial_.close();
        }
    }

    bool forward() {
        std::cout << "[ArduinoSerial] Sending: FORWARD" << std::endl;
        return send("50;50;50;50");
    }

    bool backward() {
        std::cout << "[ArduinoSerial] Sending: BACKWARD" << std::endl;
        return send("-50;-50;-50;-50");
    }

    bool stop() {
        std::cout << "[ArduinoSerial] Sending: STOP" << std::endl;
        return send("0;0;0;0");
    }

    bool turnLeft() {
        std::cout << "[ArduinoSerial] Sending: LEFT" << std::endl;
        return send("50;-50;50;-50");
    }

    bool turnRight() {
        std::cout << "[ArduinoSerial] Sending: RIGHT" << std::endl;
        return send("-50;50;-50;50");
    }

    void setWheelDiameter(double mm) { wheel_diameter_mm_ = mm; }
    void setRPM(double rpm) { rpm_ = rpm; }

    double calculateForwardTime(double distance_mm) const {

        double wheel_circ = M_PI * wheel_diameter_mm_;
        double rotations = distance_mm / wheel_circ;
        double time_sec = rotations / (rpm_ / 60.0);
        return time_sec;
    }

    double calculateTurnTime(double angle_deg, double robot_width_mm) const {
        double arc_mm = (M_PI * robot_width_mm) * (angle_deg / 360.0);
        return calculateForwardTime(arc_mm);
    }

private:
    boost::asio::io_service io_;
    boost::asio::serial_port serial_;
    std::string port_name_;
    unsigned int baudrate_;

    double wheel_diameter_mm_;
    double rpm_;
};
