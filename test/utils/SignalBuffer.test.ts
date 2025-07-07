import { SignalBuffer, BufferConfig } from '../../lib/utils/SignalBuffer';
import { SignalGenerator, TimeSeries, TimePoint } from '../../lib/types';
import { SineWaveGenerator } from '../../lib/generators/SineGenerator';

// Mock SignalGenerator for controlled testing
class MockGenerator implements SignalGenerator {
  public lastGeneratedT: number = -1;
  public generateCallCount: number = 0;
  public seriesGenerateCallCount: number = 0;

  generate(t: number): number {
    this.lastGeneratedT = t;
    this.generateCallCount++;
    return t * 10; // Simple predictable value based on time
  }

  generateSeries(startT: number, endT: number, step: number): TimeSeries {
    this.seriesGenerateCallCount++;
    const data: TimePoint[] = [];
    for (let t = startT; t <= endT; t += step) {
      data.push({ t, x: this.generate(t) });
    }
    return { data, tickDuration: step, timeUnit: 's' };
  }

  resetMock() {
    this.lastGeneratedT = -1;
    this.generateCallCount = 0;
    this.seriesGenerateCallCount = 0;
  }
}

describe('SignalBuffer', () => {
  let mockGenerator: MockGenerator;
  let defaultConfig: BufferConfig;

  beforeEach(() => {
    mockGenerator = new MockGenerator();
    defaultConfig = {
      bufferAheadSeconds: 5,
      bufferBehindSeconds: 10,
      tickDuration: 0.1, // 100ms
    };
  });

  it('should be instantiated successfully with default and custom config', () => {
    const buffer1 = new SignalBuffer(mockGenerator);
    expect(buffer1).toBeInstanceOf(SignalBuffer);
    // @ts-expect-error access private member
    expect(buffer1.config.bufferAheadSeconds).toBe(5); // Default

    const customConfig: Partial<BufferConfig> = { bufferAheadSeconds: 2, bufferBehindSeconds: 3, tickDuration: 0.05 };
    const buffer2 = new SignalBuffer(mockGenerator, customConfig);
    // @ts-expect-error access private member
    expect(buffer2.config.bufferAheadSeconds).toBe(customConfig.bufferAheadSeconds);
    // @ts-expect-error access private member
    expect(buffer2.config.bufferBehindSeconds).toBe(customConfig.bufferBehindSeconds);
    // @ts-expect-error access private member
    expect(buffer2.config.tickDuration).toBe(customConfig.tickDuration);
  });

  it('getTimeSeries should return the current time series data', () => {
    const buffer = new SignalBuffer(mockGenerator, defaultConfig);
    const ts = buffer.getTimeSeries();
    expect(ts).toEqual({ data: [], timeUnit: 's', tickDuration: defaultConfig.tickDuration });
  });

  describe('update method', () => {
    it('should initially populate buffer based on currentTime and bufferAheadSeconds', () => {
      const buffer = new SignalBuffer(mockGenerator, defaultConfig);
      const currentTime = 0;
      buffer.update(currentTime);

      const ts = buffer.getTimeSeries();
      const expectedEndT = currentTime + defaultConfig.bufferAheadSeconds;
      // lastGeneratedT is initially 0, so it generates from max(0, 0 - 0.1) = 0 up to 5
      // Points at t = 0, 0.1, 0.2, ..., 5.0
      const expectedNumPoints = Math.floor(expectedEndT / defaultConfig.tickDuration) + 1;
      expect(ts.data.length).toBe(expectedNumPoints);
      expect(ts.data[0].t).toBeCloseTo(0);
      expect(ts.data[ts.data.length - 1].t).toBeCloseTo(expectedEndT);
      expect(mockGenerator.generateCallCount).toBeGreaterThan(0);
    });

    it('should generate more data when currentTime moves forward', () => {
      const buffer = new SignalBuffer(mockGenerator, defaultConfig);
      buffer.update(0); // Initial fill up to t=5
      const initialDataLength = buffer.getTimeSeries().data.length;
      mockGenerator.resetMock();

      buffer.update(1); // currentTime = 1. Target ahead is 1 + 5 = 6. Last generated was 5.
                        // Should generate from ~5 up to 6.
      const ts = buffer.getTimeSeries();
      // Expected points from t = 0 to t = 6.
      // Original points up to 5. New points: 5.1, 5.2 ... 6.0
      const expectedNumNewPoints = Math.floor((6 - 5) / defaultConfig.tickDuration);
      expect(ts.data.length).toBeGreaterThan(initialDataLength);
      expect(ts.data.length).toBe(initialDataLength + expectedNumNewPoints);
      expect(ts.data[ts.data.length - 1].t).toBeCloseTo(6);
      expect(mockGenerator.generateCallCount).toBe(expectedNumNewPoints);
    });

    it('should not generate data if buffer is sufficiently ahead', () => {
      const buffer = new SignalBuffer(mockGenerator, defaultConfig);
      buffer.update(0); // Fills up to t=5
      mockGenerator.resetMock();

      buffer.update(0.1); // CurrentTime = 0.1. Target ahead is 0.1 + 5 = 5.1. Last generated was 5.
                          // Buffer already covers up to t=5. Only needs to generate from 5 to 5.1
      const ts = buffer.getTimeSeries();
      // Previous last t was 5.0. New target end t is 5.1.
      // Should generate 5.1
      expect(mockGenerator.generateCallCount).toBe(1); // for t = 5.1
      expect(ts.data[ts.data.length-1].t).toBeCloseTo(5.1)

      mockGenerator.resetMock();
      buffer.update(0.05); // currentTime = 0.05. Target ahead is 5.05. Last generated was 5.1
                           // No new generation needed as lastGeneratedT (5.1) > targetAheadT (5.05)
      expect(mockGenerator.generateCallCount).toBe(0);
    });

    it('should trim old data based on bufferBehindSeconds', () => {
      const buffer = new SignalBuffer(mockGenerator, { ...defaultConfig, bufferBehindSeconds: 1, tickDuration: 0.1 });
      buffer.update(0); // Fills data from t=0 to t=5

      // Current time is 2. Cutoff is 2 - 1 = 1. Data < 1 should be trimmed.
      // Data from t=0 to t=0.9 should be removed.
      buffer.update(2);
      const ts = buffer.getTimeSeries();
      expect(ts.data[0].t).toBeCloseTo(1.0);
    });

    it('should handle currentTime that requires both generation and trimming', () => {
        const config = { bufferAheadSeconds: 1, bufferBehindSeconds: 1, tickDuration: 0.1 };
        const buffer = new SignalBuffer(mockGenerator, config);

        buffer.update(0); // Generates [0, 1.0]. lastGeneratedT = 1.0
        let ts = buffer.getTimeSeries();
        expect(ts.data.length).toBe(11); // 0, 0.1, ..., 1.0
        expect(ts.data[0].t).toBeCloseTo(0);
        expect(ts.data[ts.data.length-1].t).toBeCloseTo(1.0);

        mockGenerator.resetMock();
        buffer.update(1.5); // New currentTime.
                            // Target ahead: 1.5 + 1 = 2.5. lastGeneratedT was 1.0. Generate [~1.0, 2.5]
                            // Cutoff: 1.5 - 1 = 0.5. Trim data < 0.5.
        ts = buffer.getTimeSeries();
        // Generated: 1.1, 1.2 ... 2.5 (15 points)
        // Original data that remains: 0.5, 0.6, 0.7, 0.8, 0.9, 1.0 (6 points)
        // Total = 15 + 6 = 21 points
        // Expected t range: [0.5, 2.5]
        expect(ts.data[0].t).toBeCloseTo(0.5);
        expect(ts.data[ts.data.length - 1].t).toBeCloseTo(2.5);
        const expectedPoints = Math.round((2.5 - 0.5) / 0.1) + 1;
        expect(ts.data.length).toBe(expectedPoints); // (2.5-0.5)/0.1 + 1 = 2/0.1 + 1 = 20 + 1 = 21
    });

    it('should not add duplicate time points', () => {
        const buffer = new SignalBuffer(mockGenerator, { ...defaultConfig, tickDuration: 0.1 });
        buffer.update(0); // Generates up to t=5.0
        const initialLength = buffer.getTimeSeries().data.length;

        // @ts-expect-error access private member
        buffer.lastGeneratedT = 4.95; // Force overlap on next generation
        // This should try to generate from ~4.95 to 5.0 (if current time is 0)
        // but since points like 5.0 already exist, they shouldn't be duplicated.
        // Let's test more directly:
        // @ts-expect-error access private method
        buffer.generateAndAppend(4.9, 5.1); // Tries to add 4.9, 5.0, 5.1. 5.0 is already there.

        const ts = buffer.getTimeSeries();
        const countOfT5 = ts.data.filter(p => Math.abs(p.t - 5.0) < 0.001).length;
        expect(countOfT5).toBe(1);
      });
  });

  it('getVisibleData should return data within the specified time range', () => {
    const buffer = new SignalBuffer(mockGenerator, defaultConfig);
    buffer.update(0); // Fills data from t=0 to t=5

    const visibleData = buffer.getVisibleData(1, 3);
    // Expected points: 1.0, 1.1, ..., 3.0
    const expectedNumPoints = Math.floor((3 - 1) / defaultConfig.tickDuration) + 1;
    expect(visibleData.length).toBe(expectedNumPoints);
    expect(visibleData[0].t).toBeCloseTo(1.0);
    expect(visibleData[visibleData.length - 1].t).toBeCloseTo(3.0);

    visibleData.forEach(point => {
      expect(point.x).toBe(point.t * 10); // from mockGenerator
    });
  });

  it('getVisibleData should return empty array if range is outside buffered data', () => {
    const buffer = new SignalBuffer(mockGenerator, defaultConfig);
    buffer.update(0); // Fills data from t=0 to t=5
    const visibleData = buffer.getVisibleData(10, 12);
    expect(visibleData.length).toBe(0);
  });

  it('reset method should clear all data and reset lastGeneratedT', () => {
    const buffer = new SignalBuffer(mockGenerator, defaultConfig);
    buffer.update(0);
    expect(buffer.getTimeSeries().data.length).toBeGreaterThan(0);
    // @ts-expect-error access private member
    expect(buffer.lastGeneratedT).toBeGreaterThan(0);

    buffer.reset();
    expect(buffer.getTimeSeries().data.length).toBe(0);
    // @ts-expect-error access private member
    expect(buffer.lastGeneratedT).toBe(0);
  });

  it('updateConfig method should update buffer configuration', () => {
    const buffer = new SignalBuffer(mockGenerator, defaultConfig);
    const newConfig: Partial<BufferConfig> = {
      bufferAheadSeconds: 10,
      bufferBehindSeconds: 20,
      tickDuration: 0.01,
    };
    buffer.updateConfig(newConfig);
    // @ts-expect-error access private member
    expect(buffer.config).toEqual(newConfig);
    // @ts-expect-error access private member
    expect(buffer.timeSeries.tickDuration).toBe(newConfig.tickDuration);
  });

  // Test with a real generator
  it('should work with SineWaveGenerator', () => {
    const sineParams = { amplitude: 1, frequency: 1, phase: 0, offset: 0 }; // Period 1s
    const sineGenerator = new SineWaveGenerator(sineParams);
    const buffer = new SignalBuffer(sineGenerator, {bufferAheadSeconds: 1, bufferBehindSeconds:1, tickDuration: 0.1});

    buffer.update(0); // Generate [0, 1.0]
    let ts = buffer.getTimeSeries();
    expect(ts.data.length).toBe(11); // 0, 0.1 ... 1.0
    expect(ts.data[0].t).toBeCloseTo(0);
    expect(ts.data[0].x).toBeCloseTo(sineGenerator.generate(0)); // sin(0) = 0
    expect(ts.data[5].t).toBeCloseTo(0.5);
    expect(ts.data[5].x).toBeCloseTo(sineGenerator.generate(0.5)); // sin(PI) = 0
    expect(ts.data[10].t).toBeCloseTo(1.0);
    expect(ts.data[10].x).toBeCloseTo(sineGenerator.generate(1.0)); // sin(2PI) = 0

    buffer.update(0.5); // currentTime = 0.5. Target ahead 1.5. Cutoff -0.5.
                        // Generates from ~1.0 up to 1.5. No trimming as -0.5 is start.
    ts = buffer.getTimeSeries();
    expect(ts.data.length).toBe(16); // Original 11 + 5 new points (1.1 to 1.5)
    expect(ts.data[ts.data.length-1].t).toBeCloseTo(1.5);
    expect(ts.data[ts.data.length-1].x).toBeCloseTo(sineGenerator.generate(1.5));
  });
});
