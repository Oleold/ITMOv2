# Журнал экспериментов Практики 2

Файл ведёт OpenCode по вашим запросам. Агент записывает фактические результаты экспериментов и вносит изменения в связанные файлы. Свою оценку сообщайте ему в чате; вручную заполнять шаблон не нужно.

- Выбранный слабый артефакт Практики 1:
- Что в нём нужно улучшить:
- Как поймём, что изменение полезно:

| Техника | Файл эксперимента | Изменённый файл Практики 1 | Конкретное изменение | Проверка | Что отклонили |
|---|---|---|---|---|---|
| Few-shot | [`few_shot/experiment.md`](few_shot/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Добавлены 5 юнит‑проверок: обязательный `diff`, пустой `diff`, ограничение размера `diff`, обработка ошибки парсинга ответа LLM, схема ответа сервиса | Просмотр diff, `make step2` | Принято, 5/5 |
| R.C.T.F. | [`rctf/experiment.md`](rctf/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Добавлены 4 проверки: тип `diff`=str, политика лишних полей, минимальная длина `diff`, инвариант "LLM не вызывается при ошибке валидации" | Просмотр diff, `make step2` | Принято, 5/5 |
| Chain of Verification | [`chain_of_verification/experiment.md`](chain_of_verification/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Уточнены 2 строки: лишние поля -> 2xx игнорируются; минимальная длина diff -> min 5 | Просмотр diff, `make step2` | Принято, 5/5 |
| Tree of Thoughts | [`tree_of_thoughts/experiment.md`](tree_of_thoughts/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Уточнены подтверждения для 2 строк (Given‑When‑Then) без изменения структуры | Просмотр diff, `make step2` | Принято, 5/5 |
| RAG | [`rag/experiment.md`](rag/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Добавлены источники в подтверждения трёх строк (ссылки на TRAINING_PR.diff и README) | Просмотр diff, `make step2` | Принято, 5/5 |
| ReAct | [`react/experiment.md`](react/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Унификация стиля подтверждений (Given/When/Then, «Основание: …») | Просмотр diff, `make step2` | — |
