import Constant from '../Constant';
import produce from 'immer';

const initialState = {
    todolist : [
        { no:1, todo:"Buy Laptop Computer", desc:"Macbook 16 inch(A-shop)" , done:false },
        { no:2, todo:"Study ES6", desc:"especially about Spread Operator and Arrow Function", done:false },
        { no:3, todo:"Study Vue 3", desc:"about Composition API, Vuex and Vue-router", done:true },
        { no:4, todo:"Study React", desc:"about Hook, Redux and Context API", done:false },
    ]
}

const todoReducer = (state=initialState, action) => {
    let index, newTodoList;
    switch(action.type) {
        case Constant.ADD_TODO :
            newTodoList = produce(state.todolist, (draft)=> {
                draft.push({ no:new Date().getTime(), 
                    todo:action.payload.todo, desc:action.payload.desc, done:false});
            })
            return { todolist: newTodoList };
        case Constant.DELETE_TODO : 
            index = state.todolist.findIndex((item)=>item.no === action.payload.no);
            newTodoList = produce(state.todolist, (draft)=> {
                draft.splice(index,1);
            })
            return { todolist: newTodoList };
        case Constant.TOGGLE_DONE : 
            index = state.todolist.findIndex((item)=>item.no === action.payload.no);
            newTodoList = produce(state.todolist, (draft)=> {
                draft[index].done = !draft[index].done;
            })
            return { todolist: newTodoList };
        case Constant.UPDATE_TODO : 
            index = state.todolist.findIndex((item)=>item.no === action.payload.no);
            newTodoList = produce(state.todolist, (draft)=> {
                draft[index] = action.payload;
            })
            return { todolist: newTodoList };
        default : 
            return state;
    }
}

export default todoReducer;