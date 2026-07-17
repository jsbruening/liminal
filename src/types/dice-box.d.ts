declare module "@3d-dice/dice-box" {
  export interface DiceRollResult {
    value: number;
    sides: number | string;
  }

  export interface DiceBoxConfig {
    container: string;
    assetPath: string;
    theme?: string;
    scale?: number;
    gravity?: number;
    mass?: number;
    friction?: number;
    restitution?: number;
    angularDamping?: number;
    linearDamping?: number;
    spinForce?: number;
    throwForce?: number;
    startingHeight?: number;
    settleTimeout?: number;
    offscreen?: boolean;
    delay?: number;
    enableShadows?: boolean;
    shadowTransparency?: number;
    lightIntensity?: number;
    origin?: string;
    [key: string]: unknown;
  }

  export default class DiceBox {
    constructor(config: DiceBoxConfig);
    init(): Promise<void>;
    roll(notation: string | string[]): Promise<DiceRollResult[]>;
    clear(): void;
  }
}
