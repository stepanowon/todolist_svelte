import AddTodo from './components/AddTodo.svelte'
import UpdateTodo from './components/UpdateTodo.svelte'
import TodoList from './components/TodoList.svelte'

const routes = [
  { name: '/', component: TodoList },
  { name: 'update/:no', component: UpdateTodo },
  { name: 'add', component:AddTodo },
]

export default routes;