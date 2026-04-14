import { bootstrapContent } from "@/content/bootstrap";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  allFrames: false,
  main() {
    bootstrapContent();
  },
});
