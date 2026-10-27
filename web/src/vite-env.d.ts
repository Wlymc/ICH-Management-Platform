/// <reference types="vite/client" />

declare namespace React.JSX {
  interface IntrinsicElements {
    'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      poster?: string;
      alt?: string;
      loading?: 'lazy' | 'eager';
      reveal?: 'auto' | 'manual';
      'camera-controls'?: boolean;
      'touch-action'?: string;
      'shadow-intensity'?: string;
      'shadow-softness'?: string;
      exposure?: string;
      'environment-image'?: string;
      'interaction-prompt'?: string;
      'auto-rotate'?: boolean;
    };
  }
}

interface ModelViewerElement extends HTMLElement {
  loaded: boolean;
  alt: string;
  cameraOrbit: string;
  fieldOfView: string;
  getCameraOrbit(): { theta: number; phi: number; radius: number };
  jumpCameraToGoal(): void;
}
