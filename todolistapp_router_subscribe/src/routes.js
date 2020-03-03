import AddTodo from './components/AddTodo.svelte'
import UpdateTodo from './components/UpdateTodo.svelte'
import TodoList from './components/TodoList.svelte'
import NotFound from './components/NotFound.svelte'

const routes = {
  '/' : TodoList,
  '/update/:no' : UpdateTodo,
  '/add' : AddTodo,
  '*' : NotFound,
}

export default routes;