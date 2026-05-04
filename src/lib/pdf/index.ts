// Phase 6 PDF module barrel.
//
// Both Document components are React-PDF roots; pass them to
// `renderToBuffer` / `renderToStream` from @react-pdf/renderer.
//
//   import { PlanDocument } from "@/lib/pdf";
//   import { renderToBuffer } from "@react-pdf/renderer";
//   const buf = await renderToBuffer(<PlanDocument plan={stage4Result} />);

export { PlanDocument } from "./PlanDocument";
export { LensRunDocument } from "./LensRunDocument";
