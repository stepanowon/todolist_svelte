import Constant from '../Constant';

const todoAction = {
    addTodo({todo, desc}) {
        return { type: Constant.ADD_TODO, payload: { todo, desc } }
    },
    deleteTodo(no) {
        return {type: Constant.DELETE_TODO, payload: { no } }
    },
    toggleDone(no) {
        return { type: Constant.TOGGLE_DONE, payload : { no } }
    },
    updateTodo({no, todo, desc, done}) {
        return { type: Constant.UPDATE_TODO, payload : { no, todo, desc, done } }
    }
}

export default todoAction;