# svelte로 만든 todolist app 예제
svelte로 몇가지 유형의 todolist app 예제를 만들어보았습니다

## 몇가지 유형의 todolist ap
* todolistapp
    * 라우팅 기능을 사용하지 않는 하나의 뷰로 만들어진 todolist app
* todolistapp_router
    * svelte-spa-router를 사용해 라우팅 기능 적용(Hash Router)
* todolistapp_router_redux
    * todolistapp_router에 svelte store가 아닌 redux를 적용한 버전
    * redux devtools를 사용할 수 있도록 chrome extension 적용
    * chrome extension을 설치하고 실행해야 함.(https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd)
* todolistapp_router_transition
    * todolistapp_router에 transition 기능 적용한 버전

