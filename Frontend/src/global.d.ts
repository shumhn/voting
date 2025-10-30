export { };

declare module '*.glb';
declare module '*.png';

declare module 'meshline' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const MeshLineGeometry: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const MeshLineMaterial: any;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'mesh-line-geometry': any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'mesh-line-material': any;
    }
  }
}

