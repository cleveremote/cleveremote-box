import os
from gpiozero import PWMOutputDevice
import subprocess

# Setup PWM pin (replace 18 with your GPIO pin number)
pwm = PWMOutputDevice(18)

# Function to set PWM duty cycle based on input voltage (0-5V)
def set_pwm(voltage):
    if 0 <= voltage <= 3.3:
        duty_cycle = voltage / 3.3  # Convert 0-5V to 0-1 duty cycle
        pwm.value = duty_cycle
    else:
        print(f"Invalid voltage: {voltage}. Must be between 0 and 3.3V.")

# Read from FIFO
fifo_path = '/tmp/pwm_fifo'
try:
    while True:
        set_pwm(2.2)
    # Ensure the FIFO exists
    # if not os.path.exists(fifo_path):
    #     os.mkfifo(fifo_path)
    
    # with open(fifo_path, 'r') as fifo:
    #     while True:
    #         # Read a line from the FIFO
    #         line = fifo.readline().strip()
    #         if line:
    #             try:
    #                 # Convert the line to a float voltage value
    #                 voltage = float(line)
    #                 # Set the PWM duty cycle based on the voltage
    #                 set_pwm(voltage)
    #             except ValueError:
    #                 print(f"Invalid input: {line}. Please enter a numeric value.")
except KeyboardInterrupt:
    print("Program terminated.")
finally:
    pwm.close()
    subprocess.run("pinctrl set 18 op dl", check=True, shell=True, text=True)
