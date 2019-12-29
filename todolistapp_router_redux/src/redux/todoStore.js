import { createStore, applyMiddleware } from 'redux';
import { bindTracked } from 'svelte3-redux';
import todoReducer from './todoReducer';

import todoAction from './todoAction';
import { composeWithDevTools } from 'redux-devtools-extension';
import invariant from 'redux-immutable-state-invariant';

let todoStore;
if (process.env.NODE_ENV !== 'production') {
    const composeEnhancers = composeWithDevTools(todoAction);
    todoStore = createStore(todoReducer, 
        composeEnhancers(applyMiddleware(invariant())));
} else {
    todoStore = createStore(todoReducer);
}

export default () => bindTracked(todoStore);