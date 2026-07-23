declare module "javascript-lp-solver" {
  export interface SolverModel {
    optimize: string;
    opType: "max" | "min";
    constraints: Record<string, { max?: number; min?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, 1>;
    binaries?: Record<string, 1>;
  }

  export interface SolverResult {
    feasible: boolean;
    bounded: boolean;
    result: number;
    [variable: string]: number | boolean;
  }

  const solver: {
    Solve(model: SolverModel): SolverResult;
  };

  export default solver;
}
