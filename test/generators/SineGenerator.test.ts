import { SineWaveGenerator, SineWaveParams } from '../../lib/generators/SineGenerator';
import { TimeSeries } from '../../lib/types';

describe('SineWaveGenerator', () => {
  const defaultParams: SineWaveParams = {
    amplitude: 1,
    frequency: 0.5, // Hz
    phase: 0, // radians
    offset: 0,
  };

  it('should be instantiated successfully with default params', () => {
    const generator = new SineWaveGenerator();
    expect(generator).toBeInstanceOf(SineWaveGenerator);
    // @ts-expect-error access private member for testing
    expect(generator.params).toEqual(defaultParams);
  });

  it('should be instantiated successfully with custom params', () => {
    const params: SineWaveParams = { amplitude: 2, frequency: 1, phase: Math.PI / 2, offset: 5 };
    const generator = new SineWaveGenerator(params);
    expect(generator).toBeInstanceOf(SineWaveGenerator);
    // @ts-expect-error access private member for testing
    expect(generator.params).toEqual(params);
  });

  it('updateParams method should update parameters', () => {
    const generator = new SineWaveGenerator();
    const newParams: Partial<SineWaveParams> = { amplitude: 5, frequency: 2 };
    generator.updateParams(newParams);
    // @ts-expect-error access private member for testing
    expect(generator.params.amplitude).toBe(newParams.amplitude);
    // @ts-expect-error access private member for testing
    expect(generator.params.frequency).toBe(newParams.frequency);
    // @ts-expect-error access private member for testing
    expect(generator.params.phase).toBe(defaultParams.phase); // Unchanged
    // @ts-expect-error access private member for testing
    expect(generator.params.offset).toBe(defaultParams.offset); // Unchanged
  });

  describe('generate method correctness', () => {
    it('should generate correct values for default parameters', () => {
      const generator = new SineWaveGenerator(); // A=1, f=0.5, phase=0, offset=0
      // sin(2 * PI * 0.5 * t) = sin(PI * t)
      expect(generator.generate(0)).toBeCloseTo(0); // sin(0) = 0
      expect(generator.generate(0.5)).toBeCloseTo(1); // sin(PI * 0.5) = sin(PI/2) = 1
      expect(generator.generate(1)).toBeCloseTo(0); // sin(PI) = 0
      expect(generator.generate(1.5)).toBeCloseTo(-1); // sin(PI * 1.5) = sin(3PI/2) = -1
      expect(generator.generate(2)).toBeCloseTo(0); // sin(2PI) = 0
    });

    it('should generate correct values with custom amplitude', () => {
      const amplitude = 5;
      const generator = new SineWaveGenerator({ amplitude }); // f=0.5, phase=0, offset=0
      // 5 * sin(PI * t)
      expect(generator.generate(0)).toBeCloseTo(0);
      expect(generator.generate(0.5)).toBeCloseTo(amplitude * 1);
      expect(generator.generate(1.5)).toBeCloseTo(amplitude * -1);
    });

    it('should generate correct values with custom frequency', () => {
      const frequency = 1; // Period = 1s
      const generator = new SineWaveGenerator({ frequency }); // A=1, phase=0, offset=0
      // sin(2 * PI * 1 * t) = sin(2PI * t)
      expect(generator.generate(0)).toBeCloseTo(0);    // sin(0) = 0
      expect(generator.generate(0.25)).toBeCloseTo(1); // sin(2PI * 0.25) = sin(PI/2) = 1
      expect(generator.generate(0.5)).toBeCloseTo(0);  // sin(PI) = 0
      expect(generator.generate(0.75)).toBeCloseTo(-1);// sin(3PI/2) = -1
      expect(generator.generate(1)).toBeCloseTo(0);    // sin(2PI) = 0
    });

    it('should generate correct values with custom phase', () => {
      const phase = Math.PI / 2; // shifts waveform left by 1/4 period. sin(x + PI/2) = cos(x)
      const generator = new SineWaveGenerator({ phase }); // A=1, f=0.5, offset=0
      // sin(PI * t + PI/2)
      expect(generator.generate(0)).toBeCloseTo(1);    // sin(PI/2) = 1 (peak at t=0)
      expect(generator.generate(0.5)).toBeCloseTo(0);  // sin(PI*0.5 + PI/2) = sin(PI) = 0
      expect(generator.generate(1)).toBeCloseTo(-1);   // sin(PI + PI/2) = sin(3PI/2) = -1
    });

    it('should generate correct values with custom offset', () => {
      const offset = 10;
      const generator = new SineWaveGenerator({ offset }); // A=1, f=0.5, phase=0
      // sin(PI * t) + 10
      expect(generator.generate(0)).toBeCloseTo(offset + 0);
      expect(generator.generate(0.5)).toBeCloseTo(offset + 1);
      expect(generator.generate(1.5)).toBeCloseTo(offset - 1);
    });

    it('should generate correct values with all custom parameters', () => {
      const params: SineWaveParams = { amplitude: 2, frequency: 1, phase: Math.PI, offset: 3 };
      const generator = new SineWaveGenerator(params);
      // 2 * sin(2 * PI * 1 * t + PI) + 3 = 2 * -sin(2PI * t) + 3
      // t=0: 2 * sin(PI) + 3 = 3
      expect(generator.generate(0)).toBeCloseTo(3);
      // t=0.25: 2 * sin(2PI*0.25 + PI) + 3 = 2 * sin(PI/2 + PI) + 3 = 2 * sin(3PI/2) + 3 = 2*(-1) + 3 = 1
      expect(generator.generate(0.25)).toBeCloseTo(1);
      // t=0.5: 2 * sin(2PI*0.5 + PI) + 3 = 2 * sin(PI + PI) + 3 = 2 * sin(2PI) + 3 = 3
      expect(generator.generate(0.5)).toBeCloseTo(3);
      // t=0.75: 2 * sin(2PI*0.75 + PI) + 3 = 2 * sin(3PI/2 + PI) + 3 = 2 * sin(5PI/2) + 3 = 2*1 + 3 = 5
      expect(generator.generate(0.75)).toBeCloseTo(5);
    });
  });

  describe('generateSeries method correctness', () => {
    it('should produce a TimeSeries output with correct structure', () => {
      const generator = new SineWaveGenerator();
      const startT = 0;
      const endT = 5;
      const step = 0.5;
      const series: TimeSeries = generator.generateSeries(startT, endT, step);

      expect(series).toHaveProperty('data');
      expect(series).toHaveProperty('tickDuration', step);
      expect(series).toHaveProperty('timeUnit', 's');

      const expectedLength = Math.floor((endT - startT) / step) + 1;
      expect(series.data.length).toBe(expectedLength);
      expect(series.data[0].t).toBe(startT);
      expect(series.data[expectedLength - 1].t).toBe(endT);
    });

    it('generated series should match individual generate calls', () => {
      const params: SineWaveParams = { amplitude: 3, frequency: 0.25, phase: 0, offset: 1 };
      const generator = new SineWaveGenerator(params);
      const startT = 0;
      const endT = 4; // 1 full cycle for f=0.25Hz
      const step = 1;
      const series: TimeSeries = generator.generateSeries(startT, endT, step);

      // 3 * sin(2 * PI * 0.25 * t) + 1 = 3 * sin(PI/2 * t) + 1
      // t=0: 3*sin(0)+1 = 1
      // t=1: 3*sin(PI/2)+1 = 3*1+1 = 4
      // t=2: 3*sin(PI)+1 = 3*0+1 = 1
      // t=3: 3*sin(3PI/2)+1 = 3*(-1)+1 = -2
      // t=4: 3*sin(2PI)+1 = 3*0+1 = 1

      expect(series.data.length).toBe(5);
      expect(series.data[0].x).toBeCloseTo(generator.generate(0)); // t=0
      expect(series.data[1].x).toBeCloseTo(generator.generate(1)); // t=1
      expect(series.data[2].x).toBeCloseTo(generator.generate(2)); // t=2
      expect(series.data[3].x).toBeCloseTo(generator.generate(3)); // t=3
      expect(series.data[4].x).toBeCloseTo(generator.generate(4)); // t=4

      expect(series.data[0].x).toBeCloseTo(1);
      expect(series.data[1].x).toBeCloseTo(4);
      expect(series.data[2].x).toBeCloseTo(1);
      expect(series.data[3].x).toBeCloseTo(-2);
      expect(series.data[4].x).toBeCloseTo(1);
    });

    it('should handle endT not perfectly divisible by step', () => {
        const generator = new SineWaveGenerator();
        const startT = 0;
        const endT = 2.8;
        const step = 0.5;
        // Expected t values: 0, 0.5, 1.0, 1.5, 2.0, 2.5
        const series: TimeSeries = generator.generateSeries(startT, endT, step);
        const expectedLength = Math.floor((endT - startT) / step) + 1; // 5 / 0.5 = 5 + 1 = 6
        expect(series.data.length).toBe(expectedLength);
        expect(series.data[series.data.length - 1].t).toBeCloseTo(startT + (expectedLength - 1) * step); // Should be 2.5
        expect(series.data[series.data.length - 1].t).toBeCloseTo(2.5);
      });

      it('should handle startT > endT by returning empty data', () => {
        const generator = new SineWaveGenerator();
        const series: TimeSeries = generator.generateSeries(1, 0, 0.1);
        expect(series.data.length).toBe(0);
      });
  });
});
