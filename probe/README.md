# Пробы площадок

- `probe.yml` — какие сайты открываются с GitHub (напрямую и через туннель WG_CONF).
- `sample.yml` — скачать страницы в ветку (по умолчанию `samples`) для разработки разборщиков:

```
gh api -X POST repos/chvdbhcx-del/autopodbor-collector/actions/workflows/sample.yml/dispatches \
  --input <(python3 -c "import json;print(json.dumps({'ref':'main','inputs':{'branch':'samples-kcar','urls':json.dumps([['list.html','https://...']])}}))")
```
Затем: `git fetch --depth 1 origin samples-kcar:refs/remotes/origin/samples-kcar` и `git show origin/samples-kcar:samples/list.html`.
Тело/метод/заголовки: третий элемент `{"method":"POST","body":"...","headers":{...}}`.
