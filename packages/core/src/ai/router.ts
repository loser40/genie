export type AITaskType = 'scan' | 'repair' | 'capsule' | 'summary';

export function ModelRouter(taskType: AITaskType): string {
  switch (taskType) {
    case 'scan':
      return 'cohere/command-r-plus';
    case 'repair':
      return 'meta-llama/llama-3-70b-instruct';
    case 'capsule':
    case 'summary':
      return 'mistralai/mistral-large';
    default:
      return 'cohere/command-r-plus';
  }
}
