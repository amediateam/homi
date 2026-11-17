import { Suspense } from "react";

import { PhotoViewerRoute } from "@/features/listing/viewer/PhotoViewerRoute";

/** Photo viewer (SCR-020) over the listing; the index `i` is read on the client, so the page waits in `<Suspense>`. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PhotoViewerRoute />
    </Suspense>
  );
}
