#pragma once
#include <boost/asio.hpp>
#include <iostream>
#include <string>

class ArduinoSerial {
public:
    ArduinoSerial(const std::string& port, unsigned int baudrate)
        : io_(), serial_(io_), port_name_(port), baudrate_(baudrate) {
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
        if (!serial_.is_open()) return false;

        std::string msg = data + "\n";
        boost::system::error_code ec;
        boost::asio::write(serial_, boost::asio::buffer(msg), ec);
        if (ec) {
            std::cerr << "B³¹d podczas wysy³ania: " << ec.message() << std::endl;
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
            serial_.close();
        }
    }

	bool forward() {
		return send("forward");
	}

	bool backward() {
		return send("backward");
	}

	bool stop() {
		return send("stop");
	}

	bool turnLeft() {
		return send("turn_left");
	}

	bool turnRight() {
		return send("turn_right");
	}

private:
    boost::asio::io_service io_;
    boost::asio::serial_port serial_;
    std::string port_name_;
    unsigned int baudrate_;
};
