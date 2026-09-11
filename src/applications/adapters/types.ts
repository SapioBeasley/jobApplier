import type {
  ApplicationContext,
  ApplicationResult,
} from "../types";

export interface ApplicationAdapter {
  readonly name: string;

  canHandle(url: string): Promise<boolean> | boolean;

  apply(context: ApplicationContext): Promise<ApplicationResult>;
}
