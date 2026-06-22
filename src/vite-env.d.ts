/// <reference types="vite/client" />

declare module '*?worker&inline' {
  const WorkerFactory: {
    new (options?: WorkerOptions): Worker;
  };
  export default WorkerFactory;
}
