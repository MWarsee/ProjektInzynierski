// #define DEBUG

const int SPEED_PINS[4] = {3,6, 11, 5 };  // PWM
const int DIR_PINS[4]   = {4,7, 12, 8 };  // Kierunek

const byte MAX_LEN = 32;
char inputBuffer[MAX_LEN];
byte index = 0;
bool messageReady = false;

void setup() {
  for (int i = 0; i < 4; i++) {
    pinMode(SPEED_PINS[i], OUTPUT);
    pinMode(DIR_PINS[i], OUTPUT);
  }
  Serial.begin(9600);
  Serial.println("<Arduino is ready>");

  // Ustawienie początkowe: wszystkie silniki na 0
  parseAndMoveMotors((char*)"0;0;0;0");
}

char calculateSpeed(int speed) {
  if (speed == 0) return 0;
  return 110 + ((double)speed / 100.0) * 145.0;
}

void moveMotor(int motorIndex, int speed) {
  bool direction = (speed < 0);
  if (motorIndex >= 2)
    direction = !direction;
  
  #ifdef DEBUG
  Serial.print("motor index: ");
    Serial.println(motorIndex);
  Serial.print("direction: ");
    Serial.println(direction);
    Serial.print("speed: ");
    Serial.println(speed);
  #endif
  char pwmSpeed = calculateSpeed(abs(speed));
  digitalWrite(DIR_PINS[motorIndex], direction);
  analogWrite(SPEED_PINS[motorIndex], pwmSpeed);
}

void parseAndMoveMotors(char* data) {
  int i = 0;
  char* token = strtok(data, ";");

  while (i < 4) {
    int value = token != NULL ? atoi(token) : 0;
    moveMotor(i++, value);
    token = strtok(NULL, ";");
  }
}

void loop() {
  // Szybki odczyt danych z Serial
  while (Serial.available() > 0 && !messageReady) {
    char c = Serial.read();

    #ifdef DEBUG
    Serial.print("Znak: ");
    if (c == '\n') {
      Serial.println("<newline>");
    } else {
      Serial.println(c);
    }
    #endif

    if (c == '\n') {
      inputBuffer[index] = '\0';
      messageReady = true;
    } else if (index < MAX_LEN - 1) {
      inputBuffer[index++] = c;
    } else {
      // Bufor przepełniony – reset
      index = 0;
    }
  }

  // Przetwarzanie danych
  if (messageReady) {
    #ifdef DEBUG
    Serial.print("Odebrano: ");
    Serial.println(inputBuffer);
    #endif

    parseAndMoveMotors(inputBuffer);
    index = 0;
    messageReady = false;
  }
}
