<script>
import App from "./components/App.svelte";
import { state, addTodo, deleteTodo, toggleDone } from './stores/todoStore';

let appState;
const unsubscribe = state.subscribe(value => {
		appState = value;
});

let callbacks = { addTodo, deleteTodo, toggleDone };
</script>


<!-- <svelte:head>
  <link rel="stylesheet" href="https://unpkg.com/bootstrap@3/dist/css/bootstrap.min.css">
</svelte:head> -->

<App state={appState} callbacks={callbacks} />
