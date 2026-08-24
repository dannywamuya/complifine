import { WorkspacePreview } from "@/components/marketing/workspace-preview";

export const metadata = {
  title: "Workspace preview",
  description: "A static look at the CompliFine workspace — not a live conversation.",
};

export default function PreviewPage() {
  return (
    <WorkspacePreview className="min-h-svh" footer citationsReady />
  );
}
