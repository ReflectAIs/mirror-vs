export interface ConfidenceFactors {
  buildSuccessful?: boolean;
  testsPassed?: boolean;
  diagnosticsCount: number;
  hasPatchedSuccessfully: boolean;
}

export class ConfidenceEngine {
  public calculateConfidence(factors: ConfidenceFactors): { score: number; level: 'LOW' | 'MEDIUM' | 'HIGH' } {
    let score = 0;

    if (factors.hasPatchedSuccessfully) {
      score += 20;
    }

    if (factors.buildSuccessful === true) {
      score += 30;
    }

    if (factors.testsPassed === true) {
      score += 40;
    }

    if (factors.diagnosticsCount === 0) {
      score += 10;
    } else {
      const deduction = Math.min(10, factors.diagnosticsCount * 2);
      score += (10 - deduction);
    }

    let level: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (score >= 80) {
      level = 'HIGH';
    } else if (score >= 50) {
      level = 'MEDIUM';
    }

    return { score, level };
  }
}
