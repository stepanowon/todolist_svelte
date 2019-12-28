var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined' ? window : global);
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev("SvelteDOMSetProperty", { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    /* components\InputTodo.svelte generated by Svelte v3.16.5 */

    const { console: console_1 } = globals;
    const file = "components\\InputTodo.svelte";

    function create_fragment(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let input;
    	let t0;
    	let span;
    	let dispose;

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			input = element("input");
    			t0 = space();
    			span = element("span");
    			span.textContent = "추가";
    			attr_dev(input, "id", "msg");
    			attr_dev(input, "type", "text");
    			attr_dev(input, "class", "form-control");
    			attr_dev(input, "name", "msg");
    			attr_dev(input, "placeholder", "할일을 여기에 입력!");
    			input.value = /*todo*/ ctx[0];
    			add_location(input, file, 22, 12, 337);
    			attr_dev(span, "class", "btn btn-primary input-group-addon");
    			add_location(span, file, 24, 12, 493);
    			attr_dev(div0, "class", "input-group");
    			add_location(div0, file, 21, 8, 298);
    			attr_dev(div1, "class", "col");
    			add_location(div1, file, 20, 4, 271);
    			attr_dev(div2, "class", "row");
    			add_location(div2, file, 19, 0, 248);

    			dispose = [
    				listen_dev(input, "change", /*changeTodo*/ ctx[2], false, false, false),
    				listen_dev(span, "click", /*addHandler*/ ctx[1], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div0, input);
    			append_dev(div0, t0);
    			append_dev(div0, span);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*todo*/ 1) {
    				prop_dev(input, "value", /*todo*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { callbacks } = $$props;
    	let todo = "";

    	const addHandler = () => {
    		callbacks.addTodo(todo);
    		$$invalidate(0, todo = "");
    	};

    	const changeTodo = e => {
    		$$invalidate(0, todo = e.target.value);
    		console.log(todo);
    	};

    	const writable_props = ["callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<InputTodo> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("callbacks" in $$props) $$invalidate(3, callbacks = $$props.callbacks);
    	};

    	$$self.$capture_state = () => {
    		return { callbacks, todo };
    	};

    	$$self.$inject_state = $$props => {
    		if ("callbacks" in $$props) $$invalidate(3, callbacks = $$props.callbacks);
    		if ("todo" in $$props) $$invalidate(0, todo = $$props.todo);
    	};

    	return [todo, addHandler, changeTodo, callbacks];
    }

    class InputTodo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { callbacks: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "InputTodo",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*callbacks*/ ctx[3] === undefined && !("callbacks" in props)) {
    			console_1.warn("<InputTodo> was created without expected prop 'callbacks'");
    		}
    	}

    	get callbacks() {
    		throw new Error("<InputTodo>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set callbacks(value) {
    		throw new Error("<InputTodo>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components\TodoItem.svelte generated by Svelte v3.16.5 */

    const file$1 = "components\\TodoItem.svelte";

    // (20:8) {#if item.done}
    function create_if_block(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("(완료)");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(20:8) {#if item.done}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let li;
    	let span0;
    	let t0_value = /*item*/ ctx[0].todo + "";
    	let t0;
    	let t1;
    	let span0_class_value;
    	let t2;
    	let span1;
    	let dispose;
    	let if_block = /*item*/ ctx[0].done && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			li = element("li");
    			span0 = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			if (if_block) if_block.c();
    			t2 = space();
    			span1 = element("span");
    			span1.textContent = "삭제";
    			attr_dev(span0, "class", span0_class_value = /*item*/ ctx[0].done ? "todo-done pointer" : "pointer");
    			add_location(span0, file$1, 16, 4, 330);
    			attr_dev(span1, "class", "pull-right badge pointer");
    			add_location(span1, file$1, 23, 4, 520);
    			attr_dev(li, "class", /*itemClassName*/ ctx[1]);
    			add_location(li, file$1, 15, 0, 298);

    			dispose = [
    				listen_dev(span0, "click", /*toggleHandler*/ ctx[2], false, false, false),
    				listen_dev(span1, "click", /*deleteHandler*/ ctx[3], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, span0);
    			append_dev(span0, t0);
    			append_dev(span0, t1);
    			if (if_block) if_block.m(span0, null);
    			append_dev(li, t2);
    			append_dev(li, span1);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*item*/ 1 && t0_value !== (t0_value = /*item*/ ctx[0].todo + "")) set_data_dev(t0, t0_value);

    			if (/*item*/ ctx[0].done) {
    				if (!if_block) {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(span0, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*item*/ 1 && span0_class_value !== (span0_class_value = /*item*/ ctx[0].done ? "todo-done pointer" : "pointer")) {
    				attr_dev(span0, "class", span0_class_value);
    			}

    			if (dirty & /*itemClassName*/ 2) {
    				attr_dev(li, "class", /*itemClassName*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			if (if_block) if_block.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { item } = $$props, { callbacks } = $$props;

    	const toggleHandler = () => {
    		callbacks.toggleDone(item.no);
    	};

    	const deleteHandler = () => {
    		callbacks.deleteTodo(item.no);
    	};

    	let itemClassName = "list-group-item";
    	if (item.done) itemClassName += " list-group-item-success";
    	const writable_props = ["item", "callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TodoItem> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("item" in $$props) $$invalidate(0, item = $$props.item);
    		if ("callbacks" in $$props) $$invalidate(4, callbacks = $$props.callbacks);
    	};

    	$$self.$capture_state = () => {
    		return { item, callbacks, itemClassName };
    	};

    	$$self.$inject_state = $$props => {
    		if ("item" in $$props) $$invalidate(0, item = $$props.item);
    		if ("callbacks" in $$props) $$invalidate(4, callbacks = $$props.callbacks);
    		if ("itemClassName" in $$props) $$invalidate(1, itemClassName = $$props.itemClassName);
    	};

    	return [item, itemClassName, toggleHandler, deleteHandler, callbacks];
    }

    class TodoItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { item: 0, callbacks: 4 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TodoItem",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*item*/ ctx[0] === undefined && !("item" in props)) {
    			console.warn("<TodoItem> was created without expected prop 'item'");
    		}

    		if (/*callbacks*/ ctx[4] === undefined && !("callbacks" in props)) {
    			console.warn("<TodoItem> was created without expected prop 'callbacks'");
    		}
    	}

    	get item() {
    		throw new Error("<TodoItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set item(value) {
    		throw new Error("<TodoItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get callbacks() {
    		throw new Error("<TodoItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set callbacks(value) {
    		throw new Error("<TodoItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components\TodoList.svelte generated by Svelte v3.16.5 */
    const file$2 = "components\\TodoList.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[2] = list[i];
    	return child_ctx;
    }

    // (9:4) {#each state.todolist as item}
    function create_each_block(ctx) {
    	let current;

    	const todoitem = new TodoItem({
    			props: {
    				item: /*item*/ ctx[2],
    				callbacks: /*callbacks*/ ctx[1]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(todoitem.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(todoitem, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const todoitem_changes = {};
    			if (dirty & /*state*/ 1) todoitem_changes.item = /*item*/ ctx[2];
    			if (dirty & /*callbacks*/ 2) todoitem_changes.callbacks = /*callbacks*/ ctx[1];
    			todoitem.$set(todoitem_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(todoitem.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(todoitem.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(todoitem, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(9:4) {#each state.todolist as item}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div;
    	let ul;
    	let current;
    	let each_value = /*state*/ ctx[0].todolist;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			div = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(ul, "class", "list-group");
    			add_location(ul, file$2, 7, 4, 121);
    			attr_dev(div, "class", "row");
    			add_location(div, file$2, 6, 0, 98);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*state, callbacks*/ 3) {
    				each_value = /*state*/ ctx[0].todolist;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { state } = $$props, { callbacks } = $$props;
    	const writable_props = ["state", "callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TodoList> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("state" in $$props) $$invalidate(0, state = $$props.state);
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    	};

    	$$self.$capture_state = () => {
    		return { state, callbacks };
    	};

    	$$self.$inject_state = $$props => {
    		if ("state" in $$props) $$invalidate(0, state = $$props.state);
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    	};

    	return [state, callbacks];
    }

    class TodoList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { state: 0, callbacks: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TodoList",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*state*/ ctx[0] === undefined && !("state" in props)) {
    			console.warn("<TodoList> was created without expected prop 'state'");
    		}

    		if (/*callbacks*/ ctx[1] === undefined && !("callbacks" in props)) {
    			console.warn("<TodoList> was created without expected prop 'callbacks'");
    		}
    	}

    	get state() {
    		throw new Error("<TodoList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set state(value) {
    		throw new Error("<TodoList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get callbacks() {
    		throw new Error("<TodoList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set callbacks(value) {
    		throw new Error("<TodoList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components\App.svelte generated by Svelte v3.16.5 */
    const file$3 = "components\\App.svelte";

    function create_fragment$3(ctx) {
    	let div4;
    	let div1;
    	let div0;
    	let t1;
    	let div3;
    	let div2;
    	let t2;
    	let current;

    	const inputtodo = new InputTodo({
    			props: { callbacks: /*callbacks*/ ctx[1] },
    			$$inline: true
    		});

    	const todolist = new TodoList({
    			props: {
    				state: /*state*/ ctx[0],
    				callbacks: /*callbacks*/ ctx[1]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = ":: Todolist App";
    			t1 = space();
    			div3 = element("div");
    			div2 = element("div");
    			create_component(inputtodo.$$.fragment);
    			t2 = space();
    			create_component(todolist.$$.fragment);
    			attr_dev(div0, "class", "title");
    			add_location(div0, file$3, 11, 8, 216);
    			attr_dev(div1, "class", "well");
    			add_location(div1, file$3, 10, 4, 189);
    			attr_dev(div2, "class", "panel-body");
    			add_location(div2, file$3, 14, 8, 331);
    			attr_dev(div3, "class", "panel panel-default panel-borderless");
    			add_location(div3, file$3, 13, 4, 272);
    			attr_dev(div4, "class", "container");
    			add_location(div4, file$3, 9, 0, 161);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div1);
    			append_dev(div1, div0);
    			append_dev(div4, t1);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			mount_component(inputtodo, div2, null);
    			append_dev(div2, t2);
    			mount_component(todolist, div2, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const inputtodo_changes = {};
    			if (dirty & /*callbacks*/ 2) inputtodo_changes.callbacks = /*callbacks*/ ctx[1];
    			inputtodo.$set(inputtodo_changes);
    			const todolist_changes = {};
    			if (dirty & /*state*/ 1) todolist_changes.state = /*state*/ ctx[0];
    			if (dirty & /*callbacks*/ 2) todolist_changes.callbacks = /*callbacks*/ ctx[1];
    			todolist.$set(todolist_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(inputtodo.$$.fragment, local);
    			transition_in(todolist.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(inputtodo.$$.fragment, local);
    			transition_out(todolist.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			destroy_component(inputtodo);
    			destroy_component(todolist);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { state } = $$props, { callbacks } = $$props;
    	const writable_props = ["state", "callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("state" in $$props) $$invalidate(0, state = $$props.state);
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    	};

    	$$self.$capture_state = () => {
    		return { state, callbacks };
    	};

    	$$self.$inject_state = $$props => {
    		if ("state" in $$props) $$invalidate(0, state = $$props.state);
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    	};

    	return [state, callbacks];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { state: 0, callbacks: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*state*/ ctx[0] === undefined && !("state" in props)) {
    			console.warn("<App> was created without expected prop 'state'");
    		}

    		if (/*callbacks*/ ctx[1] === undefined && !("callbacks" in props)) {
    			console.warn("<App> was created without expected prop 'callbacks'");
    		}
    	}

    	get state() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set state(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get callbacks() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set callbacks(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    function __spreadArrays() {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
            for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                r[k] = a[j];
        return r;
    }

    var _a;
    /**
     * The sentinel value returned by producers to replace the draft with undefined.
     */

    var NOTHING = typeof Symbol !== "undefined" ? Symbol("immer-nothing") : (_a = {}, _a["immer-nothing"] = true, _a);
    /**
     * To let Immer treat your class instances as plain immutable objects
     * (albeit with a custom prototype), you must define either an instance property
     * or a static property on each of your custom classes.
     *
     * Otherwise, your class instance will never be drafted, which means it won't be
     * safe to mutate in a produce callback.
     */

    var DRAFTABLE = typeof Symbol !== "undefined" && Symbol["for"] ? Symbol["for"]("immer-draftable") : "__$immer_draftable";
    var DRAFT_STATE = typeof Symbol !== "undefined" && Symbol["for"] ? Symbol["for"]("immer-state") : "__$immer_state";
    /** Returns true if the given value is an Immer draft */

    function isDraft(value) {
      return !!value && !!value[DRAFT_STATE];
    }
    /** Returns true if the given value can be drafted by Immer */

    function isDraftable(value) {
      if (!value) { return false; }
      return isPlainObject(value) || !!value[DRAFTABLE] || !!value.constructor[DRAFTABLE] || isMap(value) || isSet(value);
    }
    function isPlainObject(value) {
      if (!value || typeof value !== "object") { return false; }
      if (Array.isArray(value)) { return true; }
      var proto = Object.getPrototypeOf(value);
      return !proto || proto === Object.prototype;
    }
    /** Get the underlying object that is represented by the given draft */

    function original(value) {
      if (value && value[DRAFT_STATE]) {
        return value[DRAFT_STATE].base;
      } // otherwise return undefined

    } // We use Maps as `drafts` for Sets, not Objects
    // See proxy.js

    function assignSet(target, override) {
      override.forEach(function (value) {
        // When we add new drafts we have to remove their originals if present
        var prev = original(value);
        if (prev) { target["delete"](prev); } // @ts-ignore TODO investigate

        target.add(value);
      });
      return target;
    } // We use Maps as `drafts` for Maps, not Objects
    // See proxy.js

    function assignMap(target, override) {
      override.forEach(function (value, key) {
        return target.set(key, value);
      });
      return target;
    }
    var assign = Object.assign || function (target) {
      var arguments$1 = arguments;

      var overrides = [];

      for (var _i = 1; _i < arguments.length; _i++) {
        overrides[_i - 1] = arguments$1[_i];
      }

      overrides.forEach(function (override) {
        if (typeof override === "object" && override !== null) { Object.keys(override).forEach(function (key) {
          return target[key] = override[key];
        }); }
      });
      return target;
    };
    var ownKeys = typeof Reflect !== "undefined" && Reflect.ownKeys ? Reflect.ownKeys : typeof Object.getOwnPropertySymbols !== "undefined" ? function (obj) {
      return Object.getOwnPropertyNames(obj).concat(Object.getOwnPropertySymbols(obj));
    } : Object.getOwnPropertyNames;
    function shallowCopy(base, invokeGetters) {
      if (invokeGetters === void 0) {
        invokeGetters = false;
      }

      if (Array.isArray(base)) { return base.slice(); }
      if (isMap(base)) { return new Map(base); }
      if (isSet(base)) { return new Set(base); }
      var clone = Object.create(Object.getPrototypeOf(base));
      ownKeys(base).forEach(function (key) {
        if (key === DRAFT_STATE) {
          return; // Never copy over draft state.
        }

        var desc = Object.getOwnPropertyDescriptor(base, key);
        var value = desc.value;

        if (desc.get) {
          if (!invokeGetters) {
            throw new Error("Immer drafts cannot have computed properties");
          }

          value = desc.get.call(base);
        }

        if (desc.enumerable) {
          clone[key] = value;
        } else {
          Object.defineProperty(clone, key, {
            value: value,
            writable: true,
            configurable: true
          });
        }
      });
      return clone;
    }
    function each(obj, iter) {
      if (Array.isArray(obj) || isMap(obj) || isSet(obj)) {
        obj.forEach(function (entry, index) {
          return iter(index, entry, obj);
        });
      } else {
        ownKeys(obj).forEach(function (key) {
          return iter(key, obj[key], obj);
        });
      }
    }
    function isEnumerable(base, prop) {
      var desc = Object.getOwnPropertyDescriptor(base, prop);
      return desc && desc.enumerable ? true : false;
    }
    function has(thing, prop) {
      return isMap(thing) ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
    }
    function get(thing, prop) {
      return isMap(thing) ? thing.get(prop) : thing[prop];
    }
    function is(x, y) {
      // From: https://github.com/facebook/fbjs/blob/c69904a511b900266935168223063dd8772dfc40/packages/fbjs/src/core/shallowEqual.js
      if (x === y) {
        return x !== 0 || 1 / x === 1 / y;
      } else {
        return x !== x && y !== y;
      }
    }
    var hasSymbol = typeof Symbol !== "undefined";
    var hasMap = typeof Map !== "undefined";
    function isMap(target) {
      return hasMap && target instanceof Map;
    }
    var hasSet = typeof Set !== "undefined";
    function isSet(target) {
      return hasSet && target instanceof Set;
    }
    function makeIterable(next) {
      var _a;

      var self;
      return self = (_a = {}, _a[Symbol.iterator] = function () {
        return self;
      }, _a.next = next, _a);
    }
    /** Map.prototype.values _-or-_ Map.prototype.entries */

    function iterateMapValues(state, prop, receiver) {
      var isEntries = prop !== "values";
      return function () {
        var iterator = latest(state)[Symbol.iterator]();
        return makeIterable(function () {
          var result = iterator.next();

          if (!result.done) {
            var key = result.value[0];
            var value = receiver.get(key);
            result.value = isEntries ? [key, value] : value;
          }

          return result;
        });
      };
    }
    function makeIterateSetValues(createProxy) {
      function iterateSetValues(state, prop) {
        var isEntries = prop === "entries";
        return function () {
          var iterator = latest(state)[Symbol.iterator]();
          return makeIterable(function () {
            var result = iterator.next();

            if (!result.done) {
              var value = wrapSetValue(state, result.value);
              result.value = isEntries ? [value, value] : value;
            }

            return result;
          });
        };
      }

      function wrapSetValue(state, value) {
        var key = original(value) || value;
        var draft = state.drafts.get(key);

        if (!draft) {
          if (state.finalized || !isDraftable(value) || state.finalizing) {
            return value;
          }

          draft = createProxy(value, state);
          state.drafts.set(key, draft);

          if (state.modified) {
            state.copy.add(draft);
          }
        }

        return draft;
      }

      return iterateSetValues;
    }

    function latest(state) {
      return state.copy || state.base;
    }

    function clone(obj) {
      if (!isDraftable(obj)) { return obj; }
      if (Array.isArray(obj)) { return obj.map(clone); }
      if (isMap(obj)) { return new Map(obj); }
      if (isSet(obj)) { return new Set(obj); }
      var cloned = Object.create(Object.getPrototypeOf(obj));

      for (var key in obj) { cloned[key] = clone(obj[key]); }

      return cloned;
    }
    function freeze(obj, deep) {
      if (deep === void 0) {
        deep = false;
      }

      if (!isDraftable(obj) || isDraft(obj) || Object.isFrozen(obj)) { return; }

      if (isSet(obj)) {
        obj.add = obj.clear = obj["delete"] = dontMutateFrozenCollections;
      } else if (isMap(obj)) {
        obj.set = obj.clear = obj["delete"] = dontMutateFrozenCollections;
      }

      Object.freeze(obj);
      if (deep) { each(obj, function (_, value) {
        return freeze(value, true);
      }); }
    }

    function dontMutateFrozenCollections() {
      throw new Error("This object has been frozen and should not be mutated");
    }

    /** Each scope represents a `produce` call. */

    var ImmerScope =
    /** @class */
    function () {
      function ImmerScope(parent) {
        this.drafts = [];
        this.parent = parent; // Whenever the modified draft contains a draft from another scope, we
        // need to prevent auto-freezing so the unowned draft can be finalized.

        this.canAutoFreeze = true; // To avoid prototype lookups:

        this.patches = null; // TODO:
      }

      ImmerScope.prototype.usePatches = function (patchListener) {
        if (patchListener) {
          this.patches = [];
          this.inversePatches = [];
          this.patchListener = patchListener;
        }
      };

      ImmerScope.prototype.revoke = function () {
        this.leave();
        this.drafts.forEach(revoke); // @ts-ignore

        this.drafts = null; // TODO: // Make draft-related methods throw.
      };

      ImmerScope.prototype.leave = function () {
        if (this === ImmerScope.current) {
          ImmerScope.current = this.parent;
        }
      };

      ImmerScope.enter = function () {
        var scope = new ImmerScope(ImmerScope.current);
        ImmerScope.current = scope;
        return scope;
      };

      return ImmerScope;
    }();

    function revoke(draft) {
      draft[DRAFT_STATE].revoke();
    }

    function willFinalize(scope, result, isReplaced) {
      scope.drafts.forEach(function (draft) {
        draft[DRAFT_STATE].finalizing = true;
      });

      if (!isReplaced) {
        if (scope.patches) {
          markChangesRecursively(scope.drafts[0]);
        } // This is faster when we don't care about which attributes changed.


        markChangesSweep(scope.drafts);
      } // When a child draft is returned, look for changes.
      else if (isDraft(result) && result[DRAFT_STATE].scope === scope) {
          markChangesSweep(scope.drafts);
        }
    }
    function createProxy(base, parent) {
      var isArray = Array.isArray(base);
      var draft = clonePotentialDraft(base);

      if (isMap(base)) {
        proxyMap(draft);
      } else if (isSet(base)) {
        proxySet(draft);
      } else {
        each(draft, function (prop) {
          proxyProperty(draft, prop, isArray || isEnumerable(base, prop));
        });
      } // See "proxy.js" for property documentation.


      var scope = parent ? parent.scope : ImmerScope.current;
      var state = {
        scope: scope,
        modified: false,
        finalizing: false,
        finalized: false,
        assigned: isMap(base) ? new Map() : {},
        parent: parent,
        base: base,
        draft: draft,
        drafts: isSet(base) ? new Map() : null,
        copy: null,
        revoke: revoke$1,
        revoked: false // es5 only

      };
      createHiddenProperty(draft, DRAFT_STATE, state);
      scope.drafts.push(draft);
      return draft;
    }

    function revoke$1() {
      this.revoked = true;
    }

    function latest$1(state) {
      return state.copy || state.base;
    } // Access a property without creating an Immer draft.


    function peek(draft, prop) {
      var state = draft[DRAFT_STATE];

      if (state && !state.finalizing) {
        state.finalizing = true;
        var value = draft[prop];
        state.finalizing = false;
        return value;
      }

      return draft[prop];
    }

    function get$1(state, prop) {
      assertUnrevoked(state);
      var value = peek(latest$1(state), prop);
      if (state.finalizing) { return value; } // Create a draft if the value is unmodified.

      if (value === peek(state.base, prop) && isDraftable(value)) {
        prepareCopy(state);
        return state.copy[prop] = createProxy(value, state);
      }

      return value;
    }

    function set(state, prop, value) {
      assertUnrevoked(state);
      state.assigned[prop] = true;

      if (!state.modified) {
        if (is(value, peek(latest$1(state), prop))) { return; }
        markChanged(state);
        prepareCopy(state);
      }

      state.copy[prop] = value;
    }

    function markChanged(state) {
      if (!state.modified) {
        state.modified = true;
        if (state.parent) { markChanged(state.parent); }
      }
    }

    function prepareCopy(state) {
      if (!state.copy) { state.copy = clonePotentialDraft(state.base); }
    }

    function clonePotentialDraft(base) {
      var state = base && base[DRAFT_STATE];

      if (state) {
        state.finalizing = true;
        var draft = shallowCopy(state.draft, true);
        state.finalizing = false;
        return draft;
      }

      return shallowCopy(base);
    } // property descriptors are recycled to make sure we don't create a get and set closure per property,
    // but share them all instead


    var descriptors = {};

    function proxyProperty(draft, prop, enumerable) {
      var desc = descriptors[prop];

      if (desc) {
        desc.enumerable = enumerable;
      } else {
        descriptors[prop] = desc = {
          configurable: true,
          enumerable: enumerable,
          get: function () {
            return get$1(this[DRAFT_STATE], prop);
          },
          set: function (value) {
            set(this[DRAFT_STATE], prop, value);
          }
        };
      }

      Object.defineProperty(draft, prop, desc);
    }

    function proxyMap(target) {
      Object.defineProperties(target, mapTraps);

      if (hasSymbol) {
        Object.defineProperty(target, Symbol.iterator, // @ts-ignore
        proxyMethod(iterateMapValues) //TODO: , Symbol.iterator)
        );
      }
    }

    var mapTraps = finalizeTraps({
      size: function (state) {
        return latest$1(state).size;
      },
      has: function (state) {
        return function (key) {
          return latest$1(state).has(key);
        };
      },
      set: function (state) {
        return function (key, value) {
          if (latest$1(state).get(key) !== value) {
            prepareCopy(state);
            markChanged(state);
            state.assigned.set(key, true);
            state.copy.set(key, value);
          }

          return state.draft;
        };
      },
      "delete": function (state) {
        return function (key) {
          prepareCopy(state);
          markChanged(state);
          state.assigned.set(key, false);
          state.copy["delete"](key);
          return false;
        };
      },
      clear: function (state) {
        return function () {
          if (!state.copy) {
            prepareCopy(state);
          }

          markChanged(state);
          state.assigned = new Map();

          for (var _i = 0, _a = latest$1(state).keys(); _i < _a.length; _i++) {
            var key = _a[_i];
            state.assigned.set(key, false);
          }

          return state.copy.clear();
        };
      },
      forEach: function (state, key, reciever) {
        return function (cb) {
          latest$1(state).forEach(function (value, key, map) {
            cb(reciever.get(key), key, map);
          });
        };
      },
      get: function (state) {
        return function (key) {
          var value = latest$1(state).get(key);

          if (state.finalizing || state.finalized || !isDraftable(value)) {
            return value;
          }

          if (value !== state.base.get(key)) {
            return value;
          }

          var draft = createProxy(value, state);
          prepareCopy(state);
          state.copy.set(key, draft);
          return draft;
        };
      },
      keys: function (state) {
        return function () {
          return latest$1(state).keys();
        };
      },
      values: iterateMapValues,
      entries: iterateMapValues
    });

    function proxySet(target) {
      Object.defineProperties(target, setTraps);

      if (hasSymbol) {
        Object.defineProperty(target, Symbol.iterator, // @ts-ignore
        proxyMethod(iterateSetValues) //TODO: , Symbol.iterator)
        );
      }
    }

    var iterateSetValues = makeIterateSetValues(createProxy);
    var setTraps = finalizeTraps({
      size: function (state) {
        return latest$1(state).size;
      },
      add: function (state) {
        return function (value) {
          if (!latest$1(state).has(value)) {
            markChanged(state);

            if (!state.copy) {
              prepareCopy(state);
            }

            state.copy.add(value);
          }

          return state.draft;
        };
      },
      "delete": function (state) {
        return function (value) {
          markChanged(state);

          if (!state.copy) {
            prepareCopy(state);
          }

          return state.copy["delete"](value);
        };
      },
      has: function (state) {
        return function (key) {
          return latest$1(state).has(key);
        };
      },
      clear: function (state) {
        return function () {
          markChanged(state);

          if (!state.copy) {
            prepareCopy(state);
          }

          return state.copy.clear();
        };
      },
      keys: iterateSetValues,
      entries: iterateSetValues,
      values: iterateSetValues,
      forEach: function (state) {
        return function (cb, thisArg) {
          var iterator = iterateSetValues(state)();
          var result = iterator.next();

          while (!result.done) {
            cb.call(thisArg, result.value, result.value, state.draft);
            result = iterator.next();
          }
        };
      }
    });

    function finalizeTraps(traps) {
      return Object.keys(traps).reduce(function (acc, key) {
        var builder = key === "size" ? proxyAttr : proxyMethod;
        acc[key] = builder(traps[key], key);
        return acc;
      }, {});
    }

    function proxyAttr(fn) {
      return {
        get: function () {
          var state = this[DRAFT_STATE];
          assertUnrevoked(state);
          return fn(state);
        }
      };
    }

    function proxyMethod(trap, key) {
      return {
        get: function () {
          return function () {
            var arguments$1 = arguments;

            var args = [];

            for (var _i = 0; _i < arguments.length; _i++) {
              args[_i] = arguments$1[_i];
            }

            var state = this[DRAFT_STATE];
            assertUnrevoked(state);
            return trap(state, key, state.draft).apply(void 0, args);
          };
        }
      };
    }

    function assertUnrevoked(state) {
      if (state.revoked === true) { throw new Error("Cannot use a proxy that has been revoked. Did you pass an object from inside an immer function to an async process? " + JSON.stringify(latest$1(state))); }
    } // This looks expensive, but only proxies are visited, and only objects without known changes are scanned.


    function markChangesSweep(drafts) {
      // The natural order of drafts in the `scope` array is based on when they
      // were accessed. By processing drafts in reverse natural order, we have a
      // better chance of processing leaf nodes first. When a leaf node is known to
      // have changed, we can avoid any traversal of its ancestor nodes.
      for (var i = drafts.length - 1; i >= 0; i--) {
        var state = drafts[i][DRAFT_STATE];

        if (!state.modified) {
          if (Array.isArray(state.base)) {
            if (hasArrayChanges(state)) { markChanged(state); }
          } else if (isMap(state.base)) {
            if (hasMapChanges(state)) { markChanged(state); }
          } else if (isSet(state.base)) {
            if (hasSetChanges(state)) { markChanged(state); }
          } else if (hasObjectChanges(state)) {
            markChanged(state);
          }
        }
      }
    }

    function markChangesRecursively(object) {
      if (!object || typeof object !== "object") { return; }
      var state = object[DRAFT_STATE];
      if (!state) { return; }
      var base = state.base,
          draft = state.draft,
          assigned = state.assigned;

      if (!Array.isArray(object)) {
        // Look for added keys.
        Object.keys(draft).forEach(function (key) {
          // The `undefined` check is a fast path for pre-existing keys.
          if (base[key] === undefined && !has(base, key)) {
            assigned[key] = true;
            markChanged(state);
          } else if (!assigned[key]) {
            // Only untouched properties trigger recursion.
            markChangesRecursively(draft[key]);
          }
        }); // Look for removed keys.

        Object.keys(base).forEach(function (key) {
          // The `undefined` check is a fast path for pre-existing keys.
          if (draft[key] === undefined && !has(draft, key)) {
            assigned[key] = false;
            markChanged(state);
          }
        });
      } else if (hasArrayChanges(state)) {
        markChanged(state);
        assigned.length = true;

        if (draft.length < base.length) {
          for (var i = draft.length; i < base.length; i++) { assigned[i] = false; }
        } else {
          for (var i = base.length; i < draft.length; i++) { assigned[i] = true; }
        }

        for (var i = 0; i < draft.length; i++) {
          // Only untouched indices trigger recursion.
          if (assigned[i] === undefined) { markChangesRecursively(draft[i]); }
        }
      }
    }

    function hasObjectChanges(state) {
      var base = state.base,
          draft = state.draft; // Search for added keys and changed keys. Start at the back, because
      // non-numeric keys are ordered by time of definition on the object.

      var keys = Object.keys(draft);

      for (var i = keys.length - 1; i >= 0; i--) {
        var key = keys[i];
        var baseValue = base[key]; // The `undefined` check is a fast path for pre-existing keys.

        if (baseValue === undefined && !has(base, key)) {
          return true;
        } // Once a base key is deleted, future changes go undetected, because its
        // descriptor is erased. This branch detects any missed changes.
        else {
            var value = draft[key];
            var state_1 = value && value[DRAFT_STATE];

            if (state_1 ? state_1.base !== baseValue : !is(value, baseValue)) {
              return true;
            }
          }
      } // At this point, no keys were added or changed.
      // Compare key count to determine if keys were deleted.


      return keys.length !== Object.keys(base).length;
    }

    function hasArrayChanges(state) {
      var draft = state.draft;
      if (draft.length !== state.base.length) { return true; } // See #116
      // If we first shorten the length, our array interceptors will be removed.
      // If after that new items are added, result in the same original length,
      // those last items will have no intercepting property.
      // So if there is no own descriptor on the last position, we know that items were removed and added
      // N.B.: splice, unshift, etc only shift values around, but not prop descriptors, so we only have to check
      // the last one

      var descriptor = Object.getOwnPropertyDescriptor(draft, draft.length - 1); // descriptor can be null, but only for newly created sparse arrays, eg. new Array(10)

      if (descriptor && !descriptor.get) { return true; } // For all other cases, we don't have to compare, as they would have been picked up by the index setters

      return false;
    }

    function hasMapChanges(state) {
      var base = state.base,
          draft = state.draft;
      if (base.size !== draft.size) { return true; } // IE11 supports only forEach iteration

      var hasChanges = false;
      draft.forEach(function (value, key) {
        if (!hasChanges) {
          hasChanges = isDraftable(value) ? value.modified : value !== base.get(key);
        }
      });
      return hasChanges;
    }

    function hasSetChanges(state) {
      var base = state.base,
          draft = state.draft;
      if (base.size !== draft.size) { return true; } // IE11 supports only forEach iteration

      var hasChanges = false;
      draft.forEach(function (value, key) {
        if (!hasChanges) {
          hasChanges = isDraftable(value) ? value.modified : !base.has(key);
        }
      });
      return hasChanges;
    }

    function createHiddenProperty(target, prop, value) {
      Object.defineProperty(target, prop, {
        value: value,
        enumerable: false,
        writable: true
      });
    }

    var legacyProxy = /*#__PURE__*/Object.freeze({
        __proto__: null,
        willFinalize: willFinalize,
        createProxy: createProxy
    });

    var _a$1, _b;

    function willFinalize$1() {}
    /**
     * Returns a new draft of the `base` object.
     *
     * The second argument is the parent draft-state (used internally).
     */

    function createProxy$1(base, parent) {
      var scope = parent ? parent.scope : ImmerScope.current;
      var state = {
        // Track which produce call this is associated with.
        scope: scope,
        // True for both shallow and deep changes.
        modified: false,
        // Used during finalization.
        finalized: false,
        // Track which properties have been assigned (true) or deleted (false).
        assigned: {},
        // The parent draft state.
        parent: parent,
        // The base state.
        base: base,
        // The base proxy.
        draft: null,
        // Any property proxies.
        drafts: {},
        // The base copy with any updated values.
        copy: null,
        // Called by the `produce` function.
        revoke: null
      }; // the traps must target something, a bit like the 'real' base.
      // but also, we need to be able to determine from the target what the relevant state is
      // (to avoid creating traps per instance to capture the state in closure,
      // and to avoid creating weird hidden properties as well)
      // So the trick is to use 'state' as the actual 'target'! (and make sure we intercept everything)
      // Note that in the case of an array, we put the state in an array to have better Reflect defaults ootb

      var target = state;
      var traps = objectTraps;

      if (Array.isArray(base)) {
        target = [state];
        traps = arrayTraps;
      } // Map drafts must support object keys, so we use Map objects to track changes.
      else if (isMap(base)) {
          traps = mapTraps$1;
          state.drafts = new Map();
          state.assigned = new Map();
        } // Set drafts use a Map object to track which of its values are drafted.
        // And we don't need the "assigned" property, because Set objects have no keys.
        else if (isSet(base)) {
            traps = setTraps$1;
            state.drafts = new Map();
          }

      var _a = Proxy.revocable(target, traps),
          revoke = _a.revoke,
          proxy = _a.proxy;

      state.draft = proxy;
      state.revoke = revoke;
      scope.drafts.push(proxy);
      return proxy;
    }
    /**
     * Object drafts
     */

    var objectTraps = {
      get: function (state, prop) {
        if (prop === DRAFT_STATE) { return state; }
        var drafts = state.drafts; // Check for existing draft in unmodified state.

        if (!state.modified && has(drafts, prop)) {
          return drafts[prop];
        }

        var value = latest$2(state)[prop];

        if (state.finalized || !isDraftable(value)) {
          return value;
        } // Check for existing draft in modified state.


        if (state.modified) {
          // Assigned values are never drafted. This catches any drafts we created, too.
          if (value !== peek$1(state.base, prop)) { return value; } // Store drafts on the copy (when one exists).

          drafts = state.copy;
        }

        return drafts[prop] = createProxy$1(value, state);
      },
      has: function (state, prop) {
        return prop in latest$2(state);
      },
      ownKeys: function (state) {
        return Reflect.ownKeys(latest$2(state));
      },
      set: function (state, prop, value) {
        if (!state.modified) {
          var baseValue = peek$1(state.base, prop); // Optimize based on value's truthiness. Truthy values are guaranteed to
          // never be undefined, so we can avoid the `in` operator. Lastly, truthy
          // values may be drafts, but falsy values are never drafts.

          var isUnchanged = value ? is(baseValue, value) || value === state.drafts[prop] : is(baseValue, value) && prop in state.base;
          if (isUnchanged) { return true; }
          markChanged$1(state);
        }

        state.assigned[prop] = true;
        state.copy[prop] = value;
        return true;
      },
      deleteProperty: function (state, prop) {
        // The `undefined` check is a fast path for pre-existing keys.
        if (peek$1(state.base, prop) !== undefined || prop in state.base) {
          state.assigned[prop] = false;
          markChanged$1(state);
        } else if (state.assigned[prop]) {
          // if an originally not assigned property was deleted
          delete state.assigned[prop];
        }

        if (state.copy) { delete state.copy[prop]; }
        return true;
      },
      // Note: We never coerce `desc.value` into an Immer draft, because we can't make
      // the same guarantee in ES5 mode.
      getOwnPropertyDescriptor: function (state, prop) {
        var owner = latest$2(state);
        var desc = Reflect.getOwnPropertyDescriptor(owner, prop);

        if (desc) {
          desc.writable = true;
          desc.configurable = !Array.isArray(owner) || prop !== "length";
        }

        return desc;
      },
      defineProperty: function () {
        throw new Error("Object.defineProperty() cannot be used on an Immer draft"); // prettier-ignore
      },
      getPrototypeOf: function (state) {
        return Object.getPrototypeOf(state.base);
      },
      setPrototypeOf: function () {
        throw new Error("Object.setPrototypeOf() cannot be used on an Immer draft"); // prettier-ignore
      }
    };
    /**
     * Array drafts
     */

    var arrayTraps = {};
    each(objectTraps, function (key, fn) {
      arrayTraps[key] = function () {
        arguments[0] = arguments[0][0];
        return fn.apply(this, arguments);
      };
    });

    arrayTraps.deleteProperty = function (state, prop) {
      if (isNaN(parseInt(prop))) {
        throw new Error("Immer only supports deleting array indices"); // prettier-ignore
      }

      return objectTraps.deleteProperty.call(this, state[0], prop);
    };

    arrayTraps.set = function (state, prop, value) {
      if (prop !== "length" && isNaN(parseInt(prop))) {
        throw new Error("Immer only supports setting array indices and the 'length' property"); // prettier-ignore
      }

      return objectTraps.set.call(this, state[0], prop, value, state[0]);
    }; // Used by Map and Set drafts


    var reflectTraps = makeReflectTraps(["ownKeys", "has", "set", "deleteProperty", "defineProperty", "getOwnPropertyDescriptor", "preventExtensions", "isExtensible", "getPrototypeOf"]);
    /**
     * Map drafts
     */

    var mapTraps$1 = makeTrapsForGetters((_a$1 = {}, _a$1[DRAFT_STATE] = function (state) {
      return state;
    }, _a$1.size = function (state) {
      return latest$2(state).size;
    }, _a$1.has = function (state) {
      return function (key) {
        return latest$2(state).has(key);
      };
    }, _a$1.set = function (state) {
      return function (key, value) {
        var values = latest$2(state);

        if (!values.has(key) || values.get(key) !== value) {
          markChanged$1(state); // @ts-ignore

          state.assigned.set(key, true);
          state.copy.set(key, value);
        }

        return state.draft;
      };
    }, _a$1["delete"] = function (state) {
      return function (key) {
        if (latest$2(state).has(key)) {
          markChanged$1(state); // @ts-ignore

          state.assigned.set(key, false);
          return state.copy["delete"](key);
        }

        return false;
      };
    }, _a$1.clear = function (state) {
      return function () {
        markChanged$1(state);
        state.assigned = new Map();
        each(latest$2(state).keys(), function (_, key) {
          // @ts-ignore
          state.assigned.set(key, false);
        });
        return state.copy.clear();
      };
    }, // @ts-ignore
    _a$1.forEach = function (state, _, receiver) {
      return function (cb, thisArg) {
        return latest$2(state).forEach(function (_, key, map) {
          var value = receiver.get(key);
          cb.call(thisArg, value, key, map);
        });
      };
    }, _a$1.get = function (state) {
      return function (key) {
        var drafts = state.modified ? state.copy : state.drafts; // @ts-ignore TODO: ...or fix by using different ES6Draft types (but better just unify to maps)

        if (drafts.has(key)) {
          // @ts-ignore
          var value_1 = drafts.get(key);
          if (isDraft(value_1) || !isDraftable(value_1)) { return value_1; }
          var draft_1 = createProxy$1(value_1, state); // @ts-ignore

          drafts.set(key, draft_1);
          return draft_1;
        }

        var value = latest$2(state).get(key);

        if (state.finalized || !isDraftable(value)) {
          return value;
        }

        var draft = createProxy$1(value, state); //@ts-ignore

        drafts.set(key, draft);
        return draft;
      };
    }, _a$1.keys = function (state) {
      return function () {
        return latest$2(state).keys();
      };
    }, //@ts-ignore
    _a$1.values = iterateMapValues, //@ts-ignore
    _a$1.entries = iterateMapValues, _a$1[hasSymbol ? Symbol.iterator : "@@iterator"] = iterateMapValues, _a$1));
    var iterateSetValues$1 = makeIterateSetValues(createProxy$1);
    /**
     * Set drafts
     */

    var setTraps$1 = makeTrapsForGetters((_b = {}, //@ts-ignore
    _b[DRAFT_STATE] = function (state) {
      return state;
    }, _b.size = function (state) {
      return latest$2(state).size;
    }, _b.has = function (state) {
      return function (key) {
        return latest$2(state).has(key);
      };
    }, _b.add = function (state) {
      return function (value) {
        if (!latest$2(state).has(value)) {
          markChanged$1(state); //@ts-ignore

          state.copy.add(value);
        }

        return state.draft;
      };
    }, _b["delete"] = function (state) {
      return function (value) {
        markChanged$1(state); //@ts-ignore

        return state.copy["delete"](value);
      };
    }, _b.clear = function (state) {
      return function () {
        markChanged$1(state); //@ts-ignore

        return state.copy.clear();
      };
    }, _b.forEach = function (state) {
      return function (cb, thisArg) {
        var iterator = iterateSetValues$1(state)();
        var result = iterator.next();

        while (!result.done) {
          cb.call(thisArg, result.value, result.value, state.draft);
          result = iterator.next();
        }
      };
    }, _b.keys = iterateSetValues$1, _b.values = iterateSetValues$1, _b.entries = iterateSetValues$1, _b[hasSymbol ? Symbol.iterator : "@@iterator"] = iterateSetValues$1, _b));
    /**
     * Helpers
     */
    // Retrieve the latest values of the draft.

    function latest$2(state) {
      return state.copy || state.base;
    } // Access a property without creating an Immer draft.


    function peek$1(draft, prop) {
      var state = draft[DRAFT_STATE];
      var desc = Reflect.getOwnPropertyDescriptor(state ? latest$2(state) : draft, prop);
      return desc && desc.value;
    }

    function markChanged$1(state) {
      if (!state.modified) {
        state.modified = true;
        var base = state.base,
            drafts = state.drafts,
            parent = state.parent;
        var copy = shallowCopy(base);

        if (isSet(base)) {
          // Note: The `drafts` property is preserved for Set objects, since
          // we need to keep track of which values are drafted.
          assignSet(copy, drafts);
        } else {
          // Merge nested drafts into the copy.
          if (isMap(base)) { assignMap(copy, drafts); }else { assign(copy, drafts); }
          state.drafts = null;
        }

        state.copy = copy;

        if (parent) {
          markChanged$1(parent);
        }
      }
    }
    /** Create traps that all use the `Reflect` API on the `latest(state)` */


    function makeReflectTraps(names) {
      return names.reduce(function (traps, name) {
        // @ts-ignore
        traps[name] = function (state) {
          var arguments$1 = arguments;

          var args = [];

          for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments$1[_i];
          }

          return Reflect[name].apply(Reflect, __spreadArrays([latest$2(state)], args));
        };

        return traps;
      }, {});
    }

    function makeTrapsForGetters(getters) {
      return assign({}, reflectTraps, {
        get: function (state, prop, receiver) {
          return getters.hasOwnProperty(prop) ? getters[prop](state, prop, receiver) : Reflect.get(state, prop, receiver);
        },
        setPrototypeOf: function (state) {
          throw new Error("Object.setPrototypeOf() cannot be used on an Immer draft"); // prettier-ignore
        }
      });
    }

    var modernProxy = /*#__PURE__*/Object.freeze({
        __proto__: null,
        willFinalize: willFinalize$1,
        createProxy: createProxy$1
    });

    function generatePatches(state, basePath, patches, inversePatches) {
      var generatePatchesFn = Array.isArray(state.base) ? generateArrayPatches : isSet(state.base) ? generateSetPatches : generatePatchesFromAssigned;
      generatePatchesFn(state, basePath, patches, inversePatches);
    }

    function generateArrayPatches(state, basePath, patches, inversePatches) {
      var _a, _b;

      var base = state.base,
          copy = state.copy,
          assigned = state.assigned; // Reduce complexity by ensuring `base` is never longer.

      if (copy.length < base.length) {
        _a = [copy, base], base = _a[0], copy = _a[1];
        _b = [inversePatches, patches], patches = _b[0], inversePatches = _b[1];
      }

      var delta = copy.length - base.length; // Find the first replaced index.

      var start = 0;

      while (base[start] === copy[start] && start < base.length) {
        ++start;
      } // Find the last replaced index. Search from the end to optimize splice patches.


      var end = base.length;

      while (end > start && base[end - 1] === copy[end + delta - 1]) {
        --end;
      } // Process replaced indices.


      for (var i = start; i < end; ++i) {
        if (assigned[i] && copy[i] !== base[i]) {
          var path = basePath.concat([i]);
          patches.push({
            op: "replace",
            path: path,
            value: copy[i]
          });
          inversePatches.push({
            op: "replace",
            path: path,
            value: base[i]
          });
        }
      }

      var replaceCount = patches.length; // Process added indices.

      for (var i = end + delta - 1; i >= end; --i) {
        var path = basePath.concat([i]);
        patches[replaceCount + i - end] = {
          op: "add",
          path: path,
          value: copy[i]
        };
        inversePatches.push({
          op: "remove",
          path: path
        });
      }
    } // This is used for both Map objects and normal objects.


    function generatePatchesFromAssigned(state, basePath, patches, inversePatches) {
      var base = state.base,
          copy = state.copy;
      each(state.assigned, function (key, assignedValue) {
        var origValue = get(base, key);
        var value = get(copy, key);
        var op = !assignedValue ? "remove" : has(base, key) ? "replace" : "add";
        if (origValue === value && op === "replace") { return; }
        var path = basePath.concat(key);
        patches.push(op === "remove" ? {
          op: op,
          path: path
        } : {
          op: op,
          path: path,
          value: value
        });
        inversePatches.push(op === "add" ? {
          op: "remove",
          path: path
        } : op === "remove" ? {
          op: "add",
          path: path,
          value: origValue
        } : {
          op: "replace",
          path: path,
          value: origValue
        });
      });
    }

    function generateSetPatches(state, basePath, patches, inversePatches) {
      var base = state.base,
          copy = state.copy;
      var i = 0;
      base.forEach(function (value) {
        if (!copy.has(value)) {
          var path = basePath.concat([i]);
          patches.push({
            op: "remove",
            path: path,
            value: value
          });
          inversePatches.unshift({
            op: "add",
            path: path,
            value: value
          });
        }

        i++;
      });
      i = 0;
      copy.forEach(function (value) {
        if (!base.has(value)) {
          var path = basePath.concat([i]);
          patches.push({
            op: "add",
            path: path,
            value: value
          });
          inversePatches.unshift({
            op: "remove",
            path: path,
            value: value
          });
        }

        i++;
      });
    }

    function applyPatches(draft, patches) {
      patches.forEach(function (patch) {
        var path = patch.path,
            op = patch.op;
        if (!path.length) { throw new Error("Illegal state"); }
        var base = draft;

        for (var i = 0; i < path.length - 1; i++) {
          base = get(base, path[i]);
          if (!base || typeof base !== "object") { throw new Error("Cannot apply patch, path doesn't resolve: " + path.join("/")); } // prettier-ignore
        }

        var value = clone(patch.value); // used to clone patch to ensure original patch is not modified, see #411

        var key = path[path.length - 1];

        switch (op) {
          case "replace":
            if (isMap(base)) {
              base.set(key, value);
            } else if (isSet(base)) {
              throw new Error('Sets cannot have "replace" patches.');
            } else {
              // if value is an object, then it's assigned by reference
              // in the following add or remove ops, the value field inside the patch will also be modifyed
              // so we use value from the cloned patch
              base[key] = value;
            }

            break;

          case "add":
            if (isSet(base)) {
              base["delete"](patch.value);
            }

            Array.isArray(base) ? base.splice(key, 0, value) : isMap(base) ? base.set(key, value) : isSet(base) ? base.add(value) : base[key] = value;
            break;

          case "remove":
            Array.isArray(base) ? base.splice(key, 1) : isMap(base) ? base["delete"](key) : isSet(base) ? base["delete"](patch.value) : delete base[key];
            break;

          default:
            throw new Error("Unsupported patch operation: " + op);
        }
      });
      return draft;
    }

    function verifyMinified() {}

    var configDefaults = {
      useProxies: typeof Proxy !== "undefined" && typeof Proxy.revocable !== "undefined" && typeof Reflect !== "undefined",
      autoFreeze: typeof process !== "undefined" ? process.env.NODE_ENV !== "production" : verifyMinified.name === "verifyMinified",
      onAssign: null,
      onDelete: null,
      onCopy: null
    };

    var Immer =
    /** @class */
    function () {
      function Immer(config) {
        this.useProxies = false;
        this.autoFreeze = false;
        assign(this, configDefaults, config);
        this.setUseProxies(this.useProxies);
        this.produce = this.produce.bind(this);
        this.produceWithPatches = this.produceWithPatches.bind(this);
      }
      /**
       * The `produce` function takes a value and a "recipe function" (whose
       * return value often depends on the base state). The recipe function is
       * free to mutate its first argument however it wants. All mutations are
       * only ever applied to a __copy__ of the base state.
       *
       * Pass only a function to create a "curried producer" which relieves you
       * from passing the recipe function every time.
       *
       * Only plain objects and arrays are made mutable. All other objects are
       * considered uncopyable.
       *
       * Note: This function is __bound__ to its `Immer` instance.
       *
       * @param {any} base - the initial state
       * @param {Function} producer - function that receives a proxy of the base state as first argument and which can be freely modified
       * @param {Function} patchListener - optional function that will be called with all the patches produced here
       * @returns {any} a new state, or the initial state if nothing was modified
       */


      Immer.prototype.produce = function (base, recipe, patchListener) {
        var _this = this; // curried invocation


        if (typeof base === "function" && typeof recipe !== "function") {
          var defaultBase_1 = recipe;
          recipe = base;
          var self_1 = this;
          return function curriedProduce(base) {
            var arguments$1 = arguments;

            var _this = this;

            if (base === void 0) {
              base = defaultBase_1;
            }

            var args = [];

            for (var _i = 1; _i < arguments.length; _i++) {
              args[_i - 1] = arguments$1[_i];
            }

            return self_1.produce(base, function (draft) {
              return recipe.call.apply(recipe, __spreadArrays([_this, draft], args));
            }); // prettier-ignore
          };
        } // prettier-ignore


        {
          if (typeof recipe !== "function") {
            throw new Error("The first or second argument to `produce` must be a function");
          }

          if (patchListener !== undefined && typeof patchListener !== "function") {
            throw new Error("The third argument to `produce` must be a function or undefined");
          }
        }
        var result; // Only plain objects, arrays, and "immerable classes" are drafted.

        if (isDraftable(base)) {
          var scope_1 = ImmerScope.enter();
          var proxy = this.createProxy(base);
          var hasError = true;

          try {
            result = recipe(proxy);
            hasError = false;
          } finally {
            // finally instead of catch + rethrow better preserves original stack
            if (hasError) { scope_1.revoke(); }else { scope_1.leave(); }
          }

          if (typeof Promise !== "undefined" && result instanceof Promise) {
            return result.then(function (result) {
              scope_1.usePatches(patchListener);
              return _this.processResult(result, scope_1);
            }, function (error) {
              scope_1.revoke();
              throw error;
            });
          }

          scope_1.usePatches(patchListener);
          return this.processResult(result, scope_1);
        } else {
          result = recipe(base);
          if (result === NOTHING) { return undefined; }
          if (result === undefined) { result = base; }
          this.maybeFreeze(result, true);
          return result;
        }
      };

      Immer.prototype.produceWithPatches = function (arg1, arg2, arg3) {
        var _this = this;

        if (typeof arg1 === "function") {
          return function (state) {
            var arguments$1 = arguments;

            var args = [];

            for (var _i = 1; _i < arguments.length; _i++) {
              args[_i - 1] = arguments$1[_i];
            }

            return _this.produceWithPatches(state, function (draft) {
              return arg1.apply(void 0, __spreadArrays([draft], args));
            });
          };
        } // non-curried form


        if (arg3) { throw new Error("A patch listener cannot be passed to produceWithPatches"); }
        var patches, inversePatches;
        var nextState = this.produce(arg1, arg2, function (p, ip) {
          patches = p;
          inversePatches = ip;
        });
        return [nextState, patches, inversePatches];
      };

      Immer.prototype.createDraft = function (base) {
        if (!isDraftable(base)) {
          throw new Error("First argument to `createDraft` must be a plain object, an array, or an immerable object"); // prettier-ignore
        }

        var scope = ImmerScope.enter();
        var proxy = this.createProxy(base);
        proxy[DRAFT_STATE].isManual = true;
        scope.leave();
        return proxy;
      };

      Immer.prototype.finishDraft = function (draft, patchListener) {
        var state = draft && draft[DRAFT_STATE];

        if (!state || !state.isManual) {
          throw new Error("First argument to `finishDraft` must be a draft returned by `createDraft`"); // prettier-ignore
        }

        if (state.finalized) {
          throw new Error("The given draft is already finalized"); // prettier-ignore
        }

        var scope = state.scope;
        scope.usePatches(patchListener);
        return this.processResult(undefined, scope);
      };
      /**
       * Pass true to automatically freeze all copies created by Immer.
       *
       * By default, auto-freezing is disabled in production.
       */


      Immer.prototype.setAutoFreeze = function (value) {
        this.autoFreeze = value;
      };
      /**
       * Pass true to use the ES2015 `Proxy` class when creating drafts, which is
       * always faster than using ES5 proxies.
       *
       * By default, feature detection is used, so calling this is rarely necessary.
       */


      Immer.prototype.setUseProxies = function (value) {
        this.useProxies = value;
        assign(this, value ? modernProxy : legacyProxy);
      };

      Immer.prototype.applyPatches = function (base, patches) {
        // If a patch replaces the entire state, take that replacement as base
        // before applying patches
        var i;

        for (i = patches.length - 1; i >= 0; i--) {
          var patch = patches[i];

          if (patch.path.length === 0 && patch.op === "replace") {
            base = patch.value;
            break;
          }
        }

        if (isDraft(base)) {
          // N.B: never hits if some patch a replacement, patches are never drafts
          return applyPatches(base, patches);
        } // Otherwise, produce a copy of the base state.


        return this.produce(base, function (draft) {
          return applyPatches(draft, patches.slice(i + 1));
        });
      };
      /** @internal */


      Immer.prototype.processResult = function (result, scope) {
        var baseDraft = scope.drafts[0];
        var isReplaced = result !== undefined && result !== baseDraft;
        this.willFinalize(scope, result, isReplaced);

        if (isReplaced) {
          if (baseDraft[DRAFT_STATE].modified) {
            scope.revoke();
            throw new Error("An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft."); // prettier-ignore
          }

          if (isDraftable(result)) {
            // Finalize the result in case it contains (or is) a subset of the draft.
            result = this.finalize(result, null, scope);
            this.maybeFreeze(result);
          }

          if (scope.patches) {
            scope.patches.push({
              op: "replace",
              path: [],
              value: result
            });
            scope.inversePatches.push({
              op: "replace",
              path: [],
              value: baseDraft[DRAFT_STATE].base
            });
          }
        } else {
          // Finalize the base draft.
          result = this.finalize(baseDraft, [], scope);
        }

        scope.revoke();

        if (scope.patches) {
          scope.patchListener(scope.patches, scope.inversePatches);
        }

        return result !== NOTHING ? result : undefined;
      };
      /**
       * @internal
       * Finalize a draft, returning either the unmodified base state or a modified
       * copy of the base state.
       */


      Immer.prototype.finalize = function (draft, path, scope) {
        var _this = this;

        var state = draft[DRAFT_STATE];

        if (!state) {
          if (Object.isFrozen(draft)) { return draft; }
          return this.finalizeTree(draft, null, scope);
        } // Never finalize drafts owned by another scope.


        if (state.scope !== scope) {
          return draft;
        }

        if (!state.modified) {
          this.maybeFreeze(state.base, true);
          return state.base;
        }

        if (!state.finalized) {
          state.finalized = true;
          this.finalizeTree(state.draft, path, scope); // We cannot really delete anything inside of a Set. We can only replace the whole Set.

          if (this.onDelete && !isSet(state.base)) {
            // The `assigned` object is unreliable with ES5 drafts.
            if (this.useProxies) {
              var assigned = state.assigned;
              each(assigned, function (prop, exists) {
                var _a, _b;

                if (!exists) { (_b = (_a = _this).onDelete) === null || _b === void 0 ? void 0 : _b.call(_a, state, prop); }
              });
            } else {
              // TODO: Figure it out for Maps and Sets if we need to support ES5
              var base = state.base,
                  copy_1 = state.copy;
              each(base, function (prop) {
                var _a, _b;

                if (!has(copy_1, prop)) { (_b = (_a = _this).onDelete) === null || _b === void 0 ? void 0 : _b.call(_a, state, prop); }
              });
            }
          }

          if (this.onCopy) {
            this.onCopy(state);
          } // At this point, all descendants of `state.copy` have been finalized,
          // so we can be sure that `scope.canAutoFreeze` is accurate.


          if (this.autoFreeze && scope.canAutoFreeze) {
            freeze(state.copy, false);
          }

          if (path && scope.patches) {
            generatePatches(state, path, scope.patches, scope.inversePatches);
          }
        }

        return state.copy;
      };
      /**
       * @internal
       * Finalize all drafts in the given state tree.
       */


      Immer.prototype.finalizeTree = function (root, rootPath, scope) {
        var _this = this;

        var state = root[DRAFT_STATE];

        if (state) {
          if (!this.useProxies) {
            // Create the final copy, with added keys and without deleted keys.
            state.copy = shallowCopy(state.draft, true);
          }

          root = state.copy;
        }

        var needPatches = !!rootPath && !!scope.patches;

        var finalizeProperty = function (prop, value, parent) {
          if (value === parent) {
            throw Error("Immer forbids circular references");
          } // In the `finalizeTree` method, only the `root` object may be a draft.


          var isDraftProp = !!state && parent === root;
          var isSetMember = isSet(parent);

          if (isDraft(value)) {
            var path = isDraftProp && needPatches && !isSetMember && // Set objects are atomic since they have no keys.
            !has(state.assigned, prop) // Skip deep patches for assigned keys.
            ? rootPath.concat(prop) : null; // Drafts owned by `scope` are finalized here.

            value = _this.finalize(value, path, scope);
            replace(parent, prop, value); // Drafts from another scope must prevent auto-freezing.

            if (isDraft(value)) {
              scope.canAutoFreeze = false;
            } // Unchanged drafts are never passed to the `onAssign` hook.


            if (isDraftProp && value === get(state.base, prop)) { return; }
          } // Unchanged draft properties are ignored.
          else if (isDraftProp && is(value, get(state.base, prop))) {
              return;
            } // Search new objects for unfinalized drafts. Frozen objects should never contain drafts.
            else if (isDraftable(value) && !Object.isFrozen(value)) {
                each(value, finalizeProperty);

                _this.maybeFreeze(value);
              }

          if (isDraftProp && _this.onAssign && !isSetMember) {
            _this.onAssign(state, prop, value);
          }
        };

        each(root, finalizeProperty);
        return root;
      };

      Immer.prototype.maybeFreeze = function (value, deep) {
        if (deep === void 0) {
          deep = false;
        }

        if (this.autoFreeze && !isDraft(value)) {
          freeze(value, deep);
        }
      };

      return Immer;
    }();

    function replace(parent, prop, value) {
      if (isMap(parent)) {
        parent.set(prop, value);
      } else if (isSet(parent)) {
        // In this case, the `prop` is actually a draft.
        parent["delete"](prop);
        parent.add(value);
      } else if (Array.isArray(parent) || isEnumerable(parent, prop)) {
        // Preserve non-enumerable properties.
        parent[prop] = value;
      } else {
        Object.defineProperty(parent, prop, {
          value: value,
          writable: true,
          configurable: true
        });
      }
    }

    var immer = new Immer();
    /**
     * The `produce` function takes a value and a "recipe function" (whose
     * return value often depends on the base state). The recipe function is
     * free to mutate its first argument however it wants. All mutations are
     * only ever applied to a __copy__ of the base state.
     *
     * Pass only a function to create a "curried producer" which relieves you
     * from passing the recipe function every time.
     *
     * Only plain objects and arrays are made mutable. All other objects are
     * considered uncopyable.
     *
     * Note: This function is __bound__ to its `Immer` instance.
     *
     * @param {any} base - the initial state
     * @param {Function} producer - function that receives a proxy of the base state as first argument and which can be freely modified
     * @param {Function} patchListener - optional function that will be called with all the patches produced here
     * @returns {any} a new state, or the initial state if nothing was modified
     */

    var produce = immer.produce;
    /**
     * Like `produce`, but `produceWithPatches` always returns a tuple
     * [nextState, patches, inversePatches] (instead of just the next state)
     */

    var produceWithPatches = immer.produceWithPatches.bind(immer);
    /**
     * Pass true to automatically freeze all copies created by Immer.
     *
     * By default, auto-freezing is disabled in production.
     */

    var setAutoFreeze = immer.setAutoFreeze.bind(immer);
    /**
     * Pass true to use the ES2015 `Proxy` class when creating drafts, which is
     * always faster than using ES5 proxies.
     *
     * By default, feature detection is used, so calling this is rarely necessary.
     */

    var setUseProxies = immer.setUseProxies.bind(immer);
    /**
     * Apply an array of Immer patches to the first argument.
     *
     * This function is a producer, which means copy-on-write is in effect.
     */

    var applyPatches$1 = immer.applyPatches.bind(immer);
    /**
     * Create an Immer draft from the given base state, which may be a draft itself.
     * The draft can be modified until you finalize it with the `finishDraft` function.
     */

    var createDraft = immer.createDraft.bind(immer);
    /**
     * Finalize an Immer draft from a `createDraft` call, returning the base state
     * (if no changes were made) or a modified copy. The draft must *not* be
     * mutated afterwards.
     *
     * Pass a function as the 2nd argument to generate Immer patches based on the
     * changes that were made.
     */

    var finishDraft = immer.finishDraft.bind(immer);
    //# sourceMappingURL=immer.module.js.map

    /* AppContainer.svelte generated by Svelte v3.16.5 */
    const file$4 = "AppContainer.svelte";

    function create_fragment$4(ctx) {
    	let link;
    	let t;
    	let current;

    	const app = new App({
    			props: {
    				state: /*state*/ ctx[0],
    				callbacks: /*callbacks*/ ctx[1]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			link = element("link");
    			t = space();
    			create_component(app.$$.fragment);
    			attr_dev(link, "rel", "stylesheet");
    			attr_dev(link, "href", "https://stackpath.bootstrapcdn.com/bootstrap/3.4.1/css/bootstrap.min.css");
    			add_location(link, file$4, 39, 2, 1019);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			append_dev(document.head, link);
    			insert_dev(target, t, anchor);
    			mount_component(app, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const app_changes = {};
    			if (dirty & /*state*/ 1) app_changes.state = /*state*/ ctx[0];
    			app.$set(app_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(app.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(app.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			detach_dev(link);
    			if (detaching) detach_dev(t);
    			destroy_component(app, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let state = {
    		todolist: [
    			{ no: 1, todo: "React학습1", done: false },
    			{ no: 2, todo: "React학습2", done: false },
    			{ no: 3, todo: "React학습3", done: true },
    			{ no: 4, todo: "React학습4", done: false }
    		]
    	};

    	let addTodo = todo => {
    		$$invalidate(0, state = produce(state, draft => {
    			draft.todolist.push({
    				no: new Date().getTime(),
    				todo,
    				done: false
    			});
    		}));
    	};

    	let deleteTodo = no => {
    		let index = state.todolist.findIndex(item => item.no === no);

    		$$invalidate(0, state = produce(state, draft => {
    			draft.todolist.splice(index, 1);
    		}));
    	};

    	let toggleDone = no => {
    		let index = state.todolist.findIndex(item => item.no === no);

    		$$invalidate(0, state = produce(state, draft => {
    			draft.todolist[index].done = !draft.todolist[index].done;
    		}));
    	};

    	let callbacks = { addTodo, deleteTodo, toggleDone };

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("state" in $$props) $$invalidate(0, state = $$props.state);
    		if ("addTodo" in $$props) addTodo = $$props.addTodo;
    		if ("deleteTodo" in $$props) deleteTodo = $$props.deleteTodo;
    		if ("toggleDone" in $$props) toggleDone = $$props.toggleDone;
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    	};

    	return [state, callbacks];
    }

    class AppContainer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AppContainer",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    const app = new AppContainer({
      target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
