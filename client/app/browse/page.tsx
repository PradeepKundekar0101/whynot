import { Suspense } from "react";
import { BrowseContent } from "./BrowseContent";

export default function BrowsePage() {
  return (
    <Suspense fallback={null}>
      <BrowseContent />
    </Suspense>
  );
}
