import { createApp, h, type Component } from "vue";
import { ElConfigProvider } from "element-plus";

import "@/styles/element-plus-cover.css";
import "@/styles/base.css";

export function mountApp(rootComponent: Component) {
  createApp({
    render() {
      return h(
        ElConfigProvider,
        {
          size: "small",
          button: {
            autoInsertSpace: false,
          },
        },
        {
          default: () => h(rootComponent),
        },
      );
    },
  }).mount("#app");
}
