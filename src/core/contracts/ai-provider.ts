export interface StructuredAIRequest<T> {
  readonly system: string;
  readonly input: string;
  readonly schemaName: string;
  readonly validate: (value: unknown) => T;
}
export interface AIProvider {
  generateStructured<T>(request: StructuredAIRequest<T>): Promise<T>;
}
