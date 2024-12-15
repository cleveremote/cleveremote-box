const { promisify } = require('util');
const exec = promisify(require('child_process').exec)

export async function getGPIO (portNUm:number) {
  // Exec output contains both stderr and stdout outputs
  const nameOutput = await exec(`grep -i 'gpio${portNUm}' /sys/kernel/debug/gpio | awk -F'-' '{print $2}' | awk '{print $1}'`)

  return Number(nameOutput.stdout.trim());
};