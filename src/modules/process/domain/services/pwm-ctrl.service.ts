/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import * as fs from 'fs'

@Injectable()
export class CtrlPwmService {
  public constructor(
  ) {
  }

  // Function to send voltage values to the FIFO
  public sendVoltage(percent) {
    const voltage = 3.3 * percent / 100;
    fs.writeFileSync('/tmp/pwm_fifo', `${voltage}\n`, { flag: 'a' });
  }

}
