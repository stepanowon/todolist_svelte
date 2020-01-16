import AppContainer from "./AppContainer.svelte";
import "../node_modules/bootstrap/dist/css/bootstrap.css"

const app = new AppContainer({
  target: document.getElementById("root")
});

export default app;
