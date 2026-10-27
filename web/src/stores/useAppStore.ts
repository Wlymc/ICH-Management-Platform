import { create } from 'zustand';

export interface AssistantContext {
  page: string;
  projectId?: number;
  projectName?: string;
}

interface AppState {
  assistantOpen: boolean;
  assistantContext: AssistantContext;
  setAssistantOpen: (open: boolean) => void;
  toggleAssistant: () => void;
  setAssistantContext: (context: AssistantContext) => void;
}

export const useAppStore = create<AppState>((set) => ({
  assistantOpen: false,
  assistantContext: { page: 'global' },
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
  toggleAssistant: () => set((state) => ({ assistantOpen: !state.assistantOpen })),
  setAssistantContext: (assistantContext) => set({ assistantContext }),
}));
