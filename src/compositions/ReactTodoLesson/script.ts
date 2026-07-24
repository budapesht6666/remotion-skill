/**
 * Сценарий ролika «Todo на React за 60 секунд» — единый источник таймингов.
 * Всё в секундах (переводим в кадры через fps там, где нужно). Меняешь тайминги
 * здесь — синхронно двигаются и печать кода, и демо приложения, и караоке.
 */

/** Код, который «печатается» в редакторе. Держим строки короткими (≤ ~40 симв.),
 *  чтобы влезали без переносов в split-режиме. */
export const CODE = `import { useState } from "react";

export default function App() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState("");

  const add = () => {
    if (!text.trim()) return;
    setTodos([...todos,
      { text, done: false }]);
    setText("");
  };

  const toggle = (i) =>
    setTodos(todos.map((t, j) =>
      j === i
        ? { ...t, done: !t.done }
        : t));

  return (
    <div className="app">
      <h1>Мои задачи</h1>
      <input
        value={text}
        onChange={(e) =>
          setText(e.target.value)}
      />
      <button onClick={add}>
        Добавить
      </button>
      <ul>
        {todos.map((t, i) => (
          <li key={i}
            onClick={() => toggle(i)}>
            {t.done ? "✅" : "⬜"} {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
`;

/** Окна печати кода (в секундах). Скорость печати выводится из длины кода. */
export const TYPE_START = 2.6;
export const TYPE_END = 33.5;

/** Момент, когда UI приложения выходит на крупный план (демо). */
export const DEMO_FOCUS_FROM = 33.5;
export const DEMO_FOCUS_TO = 36;

/** Печать текста в поле ввода приложения (span + когда очищается после «Добавить»). */
export type TypeSpan = { start: number; end: number; text: string; clearAt: number };
export const INPUT_TYPES: TypeSpan[] = [
  { start: 35.8, end: 37.2, text: "Купить кофе", clearAt: 37.6 },
  { start: 38.1, end: 39.5, text: "Позвонить маме", clearAt: 39.9 },
  { start: 40.3, end: 41.9, text: "Пройти урок React", clearAt: 42.3 },
];

/** Нажатия «Добавить» — задача попадает в список. */
export type AddEvent = { sec: number; text: string };
export const ADD_EVENTS: AddEvent[] = [
  { sec: 37.6, text: "Купить кофе" },
  { sec: 39.9, text: "Позвонить маме" },
  { sec: 42.3, text: "Пройти урок React" },
];

/** Клики по задаче (переключение done). index — позиция в списке.
 *  Отмечаем все три по очереди сверху вниз — под них же двигается курсор. */
export type ToggleEvent = { sec: number; index: number };
export const TOGGLE_EVENTS: ToggleEvent[] = [
  { sec: 44.0, index: 0 },
  { sec: 45.2, index: 1 },
  { sec: 46.4, index: 2 },
];

export const OUTRO_FROM = 55;

/** Караоке-комментарии внизу. Каждая строка — фраза; подсветка идёт по словам,
 *  тайминг слова считается пропорционально его длине внутри [start, end]. */
export type CaptionLine = { text: string; start: number; end: number };
export const CAPTIONS: CaptionLine[] = [
  { text: "Пишем Todo-приложение на React за 60 секунд", start: 0.4, end: 3.4 },
  { text: "Сначала состояние: массив задач и текст поля", start: 3.6, end: 8.0 },
  { text: "useState хранит задачи и то, что мы вводим", start: 8.0, end: 13.0 },
  { text: "Функция add кладёт новую задачу в список", start: 13.0, end: 18.5 },
  { text: "toggle отмечает задачу выполненной по клику", start: 18.5, end: 24.0 },
  { text: "Рисуем поле ввода и кнопку Добавить", start: 24.0, end: 29.5 },
  { text: "И выводим все задачи через map по массиву", start: 29.5, end: 34.2 },
  { text: "Запускаем! Печатаем первую задачу", start: 34.6, end: 38.2 },
  { text: "Добавляем ещё — список растёт мгновенно", start: 38.2, end: 43.5 },
  { text: "Клик по задаче — и она уже выполнена", start: 43.5, end: 47.5 },
  { text: "React сам перерисовал только изменённое", start: 47.5, end: 52.5 },
  { text: "Рабочее Todo за минуту 🎉", start: 52.5, end: 55.4 },
  { text: "Сохрани, чтобы повторить самому 👍", start: 55.6, end: 59.6 },
];
