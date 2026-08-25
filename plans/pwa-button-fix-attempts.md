# PWA Button Fix Attempts - Inventory History Modal

## 📋 Проблема
Кнопки фильтра в модальном окне истории прихода товара работают нестабильно в PWA:
- То работают нормально
- То вообще не реагируют на нажатия
- То модальное окно закрывается при нажатии на кнопки
- Проблема проявляется случайно, без понятной закономерности

---

## 🔧 Попытка #1: Убрать dateFilter из зависимостей useEffect
**Что сделали:**
- Убрали `dateFilter` из зависимостей второго useEffect (строка 48)
- Оставили только `isOpen` в зависимостях

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #2: Добавить useRef для отслеживания состояния
**Что сделали:**
- Добавили `prevIsOpenRef` для отслеживания предыдущего состояния `isOpen`
- Сбрасываем фильтр только при переходе `true → false`

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #3: Добавить debounce в handleDateFilterChange
**Что сделали:**
- Добавили `timeoutRef` для debounce
- Установили задержку 100ms
- Использовали `clearTimeout` перед новым таймаутом

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #4: Удалить дублирующий onTouchStart
**Что сделали:**
- Убрали `onTouchStart` с кнопки закрытия фото-модалки
- Оставили только `onClick`

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #4.5: Изменить родительский элемент в InventoryItemCard
**Что сделали:**
- Изменили родительский элемент карточки товара с `<button>` на `<div>` с `role="button"`
- Причина: вложенные кнопки запрещены в HTML и вызывают проблемы на мобильных устройствах
- Добавили `touchAction: 'manipulation'` для улучшения touch events
- Добавили `tabIndex={0}` для accessibility

**Результат:** ❌ Не помогло, проблема с кнопками фильтров осталась

---

## 🔧 Попытка #4.6: Добавить onTouchStart обработчики на кнопки фильтров
**Что сделали:**
- Добавили `onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); handleDateFilterChange('all'); }}` на все кнопки фильтров
- Цель: мгновенный отклик на мобильных устройствах без 300ms задержки
- Оставили также `onClick` обработчик

**Результат:** ❌ Не помогло, создало двойную обработку событий

---

## 🔧 Попытка #4.7: Увеличить размер кнопки закрытия Dialog
**Что сделали:**
- Увеличили кнопку закрытия с 16px до 24px (h-4 w-4 → h-6 w-6)
- Установили минимальный размер 44px для touch target (рекомендация Apple)
- Добавили `touchAction: 'manipulation'` и `WebkitTouchCallout: 'none'`
- Увеличили z-index до 50 для кнопки закрытия фото

**Результат:** ❌ Не помогло, кнопка закрытия иногда не видна в дизайне

---

## 🔧 Попытка #4.8: Добавить touchAction и WebkitTouchCallout на все кнопки
**Что сделали:**
- Добавили `style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none' }}` на все кнопки фильтров
- Добавили те же стили на кнопку закрытия фото
- Добавили те же стили на DialogContent
- Цель: предотвратить 300ms задержку и текстовое выделение на touch

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #4.9: Добавить DebugLogViewer компонент
**Что сделали:**
- Создали `components/debug/DebugLogViewer.tsx` для визуального отображения логов в UI
- Добавили глобальное хранилище логов с MAX_LOGS = 1000
- Добавили кнопки: Copy, Export, Clear, Minimize/Expand
- Интегрировали DebugLogViewer в `components/admin/Inventory.tsx`
- Добавили `addDebugLog` вызовы во все ключевые моменты

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #5: Убрать все style с touchAction и WebkitTouchCallout
**Что сделали:**
- Убрали `style={{ touchAction: 'manipulation' }}` из DialogContent
- Убрали `style={{ WebkitTouchCallout: 'none' }}` из всех кнопок
- Убрали `style={{ userSelect: 'none' }}` из DialogContent

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #6: Заменить onClick на onPointerDown на кнопках фильтра
**Что сделали:**
- Заменили все кнопки фильтра на `onPointerDown`
- Добавили `e.preventDefault()` и `e.stopPropagation()`
- Добавили `disabled={isFilterChanging}` на кнопки

**Результат:** ❌ Не помогло, модалка стала закрываться при нажатии на кнопки

---

## 🔧 Попытка #7: Добавить isChangingFilterRef и isFilterChanging state
**Что сделали:**
- Добавили `isChangingFilterRef` для защиты от быстрых кликов
- Добавили `isFilterChanging` state для блокировки кнопок
- Установили таймаут 200ms для разблокировки
- Сбрасываем блокировки при закрытии модалки

**Результат:** ❌ Не помогло, кнопки блокируются и не работают при повторном открытии

---

## 🔧 Попытка #8: Упростить handleDateFilterChange без event параметра
**Что сделали:**
- Убрали параметр `e` из `handleDateFilterChange`
- Убрали проверки на `e.stopPropagation()` и `e.preventDefault()`

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #9: Исправить handleOpenChange - сброс блокировок
**Что сделали:**
- Добавили сброс `isChangingFilterRef.current = false` перед закрытием
- Добавили сброс `setIsFilterChanging(false)` перед закрытием

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #10: Комбинация onPointerDown + onClick
**Что сделали:**
- Добавили `onPointerDown={(e) => e.preventDefault()}` для предотвращения 300ms задержки
- Добавили `onClick={(e) => e.stopPropagation()}` для предотвращения закрытия модалки
- Добавили `onClick={(e) => e.stopPropagation()}` на контейнер кнопок

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #11: Вернуться на простой onClick (как в других модалках)
**Что сделали:**
- Изучили рабочие модалки: `AddWorkerModal`, `AssignWorkerModal`
- Убрали `onPointerDown` полностью
- Убрали `stopPropagation()` с кнопок
- Вернулись на простой `onClick={() => handleDateFilterChange('all')}`
- Убрали `onClick` с контейнера кнопок

**Результат:** ❌ Не помогло

---

## 🔧 Попытка #12: Полностью убрать блокировки и логи
**Что сделали:**
- Убрали `isChangingFilterRef` и `isFilterChanging` полностью
- Убрали `timeoutRef` и все таймауты
- Убрали `disabled={isFilterChanging}` с кнопок
- Убрали все `addDebugLog` вызовы
- Убрали лишние импорты: `useRef`, `formatDate`, `addDebugLog`
- `handleDateFilterChange` теперь просто: `setDateFilter(filter)`
- `handleOpenChange` просто: `if (!open) onClose()`

**Результат:** ❌ Не помогло, проблема остается

---

## 🔧 Попытка #13: Добавить cursor: pointer на все кнопки фильтра
**Что сделали:**
- Добавили `cursor-pointer` в className на все 4 кнопки фильтра
- iOS Safari требует CSS-свойство `cursor: pointer` для корректной работы click events на touch-устройствах
- Без этого свойства клики срабатывают нестабильно (2-10 попыток)

**Изменения:**
```tsx
<Button
  variant={dateFilter === 'all' ? 'default' : 'outline'}
  size="sm"
  onClick={() => handleDateFilterChange('all')}
  className="flex-1 cursor-pointer"  // ← ДОБАВЛЕНО
  type="button"
>
  Все
</Button>
```

**Результат:** ❌ Не помогло, проблема остается. Крестик для закрытия модального окна тоже не работает вместе с четырьмя кнопками.

---

## 🔧 Попытка #17: Заменить Button на нативный <button>
**Что сделали:**
- Заменили Button компоненты на нативные `<button>` элементы для всех 4 кнопок фильтра
- Добавили `cursor-pointer` на кнопку закрытия фото-модалки
- Добавили `cursor-pointer` на кнопку скачивания фото
- Убрали импорт Button компонента
- Использовали Tailwind CSS классы для стилизации вместо variant и size props

**Изменения:**
```tsx
<button
  type="button"
  onClick={() => handleDateFilterChange('all')}
  className={cn(
    "flex-1 cursor-pointer px-4 py-2 rounded-md font-medium transition-colors text-sm",
    dateFilter === 'all'
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-input"
  )}
>
  Все
</button>
```

**Результат:** ❌ Не помогло. При первом запуске все работает нормально, но после закрытия и повторного открытия приложения проблема возвращается. Также замечено: при нажатии на крестик автоматически переключается на месяц и все перестает работать.

---

## 🔧 Попытка #15: Использовать DialogPrimitive напрямую
**Что сделали:**
- Заменили `DialogContent` на `DialogPrimitive.Content`
- Изменили `onOpenChange` с простого `onClose` на `(open) => !open && onClose()`
- Добавили `onPointerDownOutside={(e) => e.preventDefault()}` для предотвращения закрытия по клику вне модалки
- Добавили `onInteractOutside={(e) => e.preventDefault()}` для предотвращения закрытия по взаимодействию вне модалки

**Изменения:**
```tsx
<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
  <DialogPrimitive.Content
    className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-2xl max-h-[85vh] overflow-y-auto scroll-mobile border bg-white p-6 shadow-lg rounded-lg z-[100] flex flex-col"
    onPointerDownOutside={(e) => e.preventDefault()}
    onInteractOutside={(e) => e.preventDefault()}
  >
    {/* контент */}
  </DialogPrimitive.Content>
</Dialog>
```

**Результат:** ❌ Не помогло. Модальное окно перестало закрываться при клике вне модалки, и крестик для закрытия исчез.

---

## 🔧 Попытка #15.2: Добавить крестик для закрытия модального окна
**Что сделали:**
- Добавили `DialogPrimitive.Close` кнопку в заголовок модального окна
- Убрали `onPointerDownOutside` и `onInteractOutside` обработчики (они блокировали закрытие)
- Крестик теперь позволяет закрыть модальное окно

**Изменения:**
```tsx
<DialogHeader>
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <DialogTitle className="text-lg md:text-xl font-bold">История прихода</DialogTitle>
      <span className="text-gray-400">|</span>
      <span className="text-sm font-semibold text-gray-700">{itemName}</span>
    </div>
    <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
      <X className="h-4 w-4" />
      <span className="sr-only">Закрыть</span>
    </DialogPrimitive.Close>
  </div>
</DialogHeader>
```

**Результат:** ❌ Не помогло. Кнопки фильтра по-прежнему не работают в Safari PWA. В Telegram Desktop браузере все работает нормально, проблема только в Safari PWA приложении.

---

## 🔧 Попытка #14: Проверить DialogContent - убрать анимации
**Что сделали:**
- Добавили `onAnimationEnd` обработчик на DialogPrimitive.Content
- Сбрасываем `pointerEvents = 'auto'` после завершения анимации
- Анимации DialogContent могут блокировать pointer events на touch-устройствах

**Изменения:**
```tsx
<DialogPrimitive.Content
  className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-2xl max-h-[85vh] overflow-y-auto scroll-mobile border bg-white p-6 shadow-lg rounded-lg z-[100] flex flex-col"
  onAnimationEnd={(e) => {
    e.currentTarget.style.pointerEvents = 'auto';
  }}
>
```

**Результат:** ❌ Не помогло. Кнопки фильтра по-прежнему не работают в Safari PWA. Кроме того, создала новую проблему: при нажатии на "История прихода" открываются ДВА модальных окна одновременно. Откатил изменения.

---

## 🔧 Попытка #19: FastClick.js для iOS PWA touch событий
**Что сделали:**
- Установили библиотеку `fastclick` через npm
- Добавили импорт `import FastClick from 'fastclick'` в App.tsx
- Добавили useEffect для инициализации FastClick на document.body
- Проверка на PWA: `'addEventListener' in document && 'standalone' in window.navigator`

**Изменения:**
```tsx
import FastClick from 'fastclick';

export default function App() {
  // ... existing code ...

  useEffect(() => {
    if ('addEventListener' in document && 'standalone' in window.navigator) {
      FastClick.attach(document.body);
    }
  }, []);
}
```

**Результат:** ❌ Не помогло. Ошибка сборки Vite: `Rollup failed to resolve import "fastclick"`. Библиотека несовместима с ES модулями. Откатил изменения.

---

## 🔧 Попытка #20: CSS touch-action: manipulation
**Что сделали:**
- Добавили `touch-action: manipulation` глобально для всех элементов в index.css
- Это нативное CSS свойство поддерживается всеми современными браузерами
- Устраняет 300ms задержку на touch-устройствах без дополнительных библиотек
- Viewport meta tag уже был правильный: `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no`

**Изменения:**
```css
@layer base {
  * {
    border-color: hsl(var(--border));
    caret-color: hsl(var(--foreground));
    touch-action: manipulation;  /* ← ДОБАВЛЕНО */
  }
  /* ... */
}
```

**Результат:** ❌ Не помогло. Кнопки фильтра по-прежнему не работают в Safari PWA. Проблема сохраняется.

---

##  Анализ рабочиих модалок

### AddWorkerModal.tsx
```tsx
<Dialog open={isOpen} onOpenChange={onClose}>
  <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto scroll-mobile">
    <DialogHeader>
      <DialogTitle>Добавить нового мойщика</DialogTitle>
    </DialogHeader>
    <form onSubmit={handleSubmit}>
      {/* поля формы */}
      <Button type="button" variant="outline" onClick={onClose}>
        Отмена
      </Button>
      <Button type="submit">Добавить</Button>
    </form>
  </DialogContent>
</Dialog>
```

**Ключевые особенности:**
- Простой `onOpenChange={onClose}` без проверок
- Кнопки используют простой `onClick` без `stopPropagation()`
- Никаких `onPointerDown`, `preventDefault()`, блокировок
- Никаких логов отладки

### AssignWorkerModal.tsx
```tsx
<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
  <DialogPrimitive.Content className="...">
    <DialogHeader>
      <DialogTitle>Сменить мойщика</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 py-4">
      {availableWorkerUnits.map((unit) => (
        <button
          key={unit.id}
          onClick={() => onAssign(unit.id)}
          className="..."
        >
          {/* контент кнопки */}
        </button>
      ))}
    </div>
    <Button variant="outline" onClick={onClose}>Отмена</Button>
    <DialogPrimitive.Close>✕</DialogPrimitive.Close>
  </DialogPrimitive.Content>
</Dialog>
```

**Ключевые особенности:**
- Использует `DialogPrimitive.Content` вместо `DialogContent`
- `onOpenChange={(open) => !open && onClose()}` - проверка только на закрытие
- Кнопки используют простой `onClick` без `stopPropagation()`
- Никаких блокировок или логов

---

## 🔧 Попытка #21: Полный сброс state при открытии модального окна
**Что сделали:**
- Изменили useEffect с `if (!isOpen)` на `if (isOpen)`
- Теперь сбрасываем `dateFilter` и `selectedPhoto` ПРИ ОТКРЫТИИ модалки, а не при закрытии
- Добавили `document.body.offsetHeight` для принудительного reflow

**Изменения:**
```tsx
useEffect(() => {
  if (isOpen) {
    // Полный сброс state при открытии
    setDateFilter('all');
    setSelectedPhoto(null);
    
    // Принудительный reflow
    document.body.offsetHeight;
  }
}, [isOpen]);
```

**Результат:** ❌ Не помогло. При закрытии окна переключается на месяц и после этого кнопки перестают работать.

---

## 🔧 Попытка #22: Изолировать кнопки фильтра от Dialog events
**Что сделали:**
- Добавили `onClick={(e) => e.stopPropagation()}` на контейнер кнопок
- Добавили `onPointerDown={(e) => e.stopPropagation()}` на контейнер кнопок
- Добавили `e.stopPropagation()` внутри всех 4 кнопок фильтра перед вызовом `handleDateFilterChange`

**Изменения:**
```tsx
<div
  className="flex gap-2 mt-4"
  onClick={(e) => e.stopPropagation()}
  onPointerDown={(e) => e.stopPropagation()}
>
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      handleDateFilterChange('all');
    }}
    className={cn(
      "flex-1 cursor-pointer px-4 py-2 rounded-md font-medium transition-colors text-sm",
      dateFilter === 'all'
        ? "bg-primary text-primary-foreground hover:bg-primary/90"
        : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-input"
    )}
  >
    Все
  </button>
  {/* остальные кнопки аналогично */}
</div>
```

**Результат:** ❌ Не помогло. Проблема с кнопками фильтра осталась.

---

##  Возможные причины проблемы

### 1. Проблема с Dialog компонентом
Возможно, проблема в самом `Dialog` компоненте из `@/components/ui/dialog`. Нужно проверить реализацию.

### 2. Проблема с DialogContent
Возможно, проблема в `DialogContent` - может перехватывать события неправильно. `AssignWorkerModal` использует `DialogPrimitive.Content` напрямую.

### 3. Проблема с PWA браузером
Возможно, специфическая проблема с PWA в конкретном браузере (Safari на iOS, Chrome на Android и т.д.).

### 4. Проблема с scroll-mobile классом
Возможно, класс `scroll-mobile` влияет на обработку событий.

### 5. Проблема с React Strict Mode
Возможно, React Strict Mode вызывает двойной рендер и проблемы с событиями.

### 6. Проблема с z-index или позиционированием
Возможно, элементы перекрывают кнопки или перехватывают события.

---

## 🔧 Попытка #21: Полный сброс state при открытии модального окна
**Что сделали:**
- Изменили useEffect с `if (!isOpen)` на `if (isOpen)`
- Теперь сбрасываем `dateFilter` и `selectedPhoto` ПРИ ОТКРЫТИИ модалки, а не при закрытии
- Добавили `document.body.offsetHeight` для принудительного reflow

**Изменения:**
```tsx
useEffect(() => {
  if (isOpen) {
    // Полный сброс state при открытии
    setDateFilter('all');
    setSelectedPhoto(null);
    
    // Принудительный reflow
    document.body.offsetHeight;
  }
}, [isOpen]);
```

**Результат:** ❌ Не помогло. При закрытии окна переключается на месяц и после этого кнопки перестают работать.

---

## 🔧 Попытка #22: Изолировать кнопки фильтра от Dialog events
**Что сделали:**
- Добавили `onClick={(e) => e.stopPropagation()}` на контейнер кнопок
- Добавили `onPointerDown={(e) => e.stopPropagation()}` на контейнер кнопок
- Добавили `e.stopPropagation()` внутри всех 4 кнопок фильтра перед вызовом `handleDateFilterChange`

**Изменения:**
```tsx
<div
  className="flex gap-2 mt-4"
  onClick={(e) => e.stopPropagation()}
  onPointerDown={(e) => e.stopPropagation()}
>
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      handleDateFilterChange('all');
    }}
    className={cn(
      "flex-1 cursor-pointer px-4 py-2 rounded-md font-medium transition-colors text-sm",
      dateFilter === 'all'
        ? "bg-primary text-primary-foreground hover:bg-primary/90"
        : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-input"
    )}
  >
    Все
  </button>
  {/* остальные кнопки аналогично */}
</div>
```

**Результат:** ❌ Не помогло. Проблема с кнопками фильтра осталась.

---

## 🔧 Попытка #23: Переместить кнопки фильтра в DialogHeader
**Что сделали:**
- Переместили кнопки фильтра внутрь `DialogHeader`
- Кнопки теперь в "безопасной зоне" DialogHeader, где Dialog events не так агрессивны
- Оставили `onClick` и `onPointerDown` с `stopPropagation()` на контейнере кнопок

**Изменения:**
```tsx
<DialogHeader>
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      <DialogTitle className="text-lg md:text-xl font-bold">История прихода</DialogTitle>
      <span className="text-gray-400">|</span>
      <span className="text-sm font-semibold text-gray-700">{itemName}</span>
    </div>
    <DialogPrimitive.Close className="...">
      <X className="h-4 w-4" />
      <span className="sr-only">Закрыть</span>
    </DialogPrimitive.Close>
  </div>
  
  {/* КНОПКИ ФИЛЬТРА ЗДЕСЬ - В HEADER */}
  <div
    className="flex gap-2"
    onClick={(e) => e.stopPropagation()}
    onPointerDown={(e) => e.stopPropagation()}
  >
    {/* кнопки фильтра */}
  </div>
</DialogHeader>
```

**Результат:** ❌ Не помогло. При первом открытии кнопки работают нормально, но потом перестают работать. Также замечено: когда модальное окно открывается, крестик активный как будто его выделили (в рамочке).

---

## 🔧 Попытка #24: Использовать Portal для кнопок фильтра
**Что сделали:**
- Создали `filterPortalRoot` через `useState(() => document.createElement('div'))`
- Добавили `useEffect` для добавления/удаления portal root в DOM
- Вынесли кнопки фильтра в `createPortal` с `z-index: 101` (выше Dialog)
- Кнопки рендерятся вне DOM-дерева Dialog

**Изменения:**
```tsx
const [filterPortalRoot] = useState(() => {
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.zIndex = '101';
  return div;
});

useEffect(() => {
  if (isOpen) {
    document.body.appendChild(filterPortalRoot);
  }
  return () => {
    if (filterPortalRoot.parentNode) {
      filterPortalRoot.parentNode.removeChild(filterPortalRoot);
    }
  };
}, [isOpen, filterPortalRoot]);

{isOpen && createPortal(
  <div className="fixed top-[20%] left-[50%] translate-x-[-50%] flex gap-2 z-[101]">
    {/* кнопки фильтра */}
  </div>,
  filterPortalRoot
)}
```

**Результат:** ❌ Не помогло. На ПК версии все кнопки пропали!

---

## 🔧 Попытка #25: Заменить DialogPrimitive.Close на обычную кнопку
**Что сделали:**
- Заменили `DialogPrimitive.Close` на обычный `<button>` элемент
- Добавили `onClick={(e) => { e.stopPropagation(); onClose(); }}`
- Сделали то же самое для кнопки закрытия фото-модалки

**Изменения:**
```tsx
<button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    onClose();
  }}
  className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none cursor-pointer"
>
  <X className="h-4 w-4" />
  <span className="sr-only">Закрыть</span>
</button>
```

**Результат:** ❌ Не помогло. Проблема с кнопками фильтра осталась.

---

## 🔧 Попытка #26: Комбо-решение (все гипотезы сразу)
**Что сделали:**
1. ✅ Добавили `key={isOpen ? 'open' : 'closed'}` на Dialog для полного пересоздания компонента
2. ✅ Заменили `useEffect` на `useLayoutEffect` для синхронного сброса до рендера
3. ✅ Добавили `useCallback` для всех обработчиков (`handleOpenChange`, `handleDateFilterChange`, `handleClosePhotoModal`, `handlePhotoModalOpenChange`)
4. ✅ Добавили `onClickCapture` и `onPointerDownCapture` на контейнер кнопок
5. ✅ Добавили `onPointerDownOutside`, `onInteractOutside`, `onEscapeKeyDown` на DialogPrimitive.Content
6. ✅ Добавили `style={{ willChange: 'transform, opacity', transform: 'translate3d(0, 0, 0)' }}` для GPU ускорения
7. ✅ Добавили `isReady` state с 50ms задержкой перед разблокировкой кнопок
8. ✅ Добавили `buttonRefs` useRef для прямого доступа к кнопкам и установки `pointerEvents: 'auto'` и `touchAction: 'manipulation'`

**Изменения:**
```tsx
// Imports
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';

// State
const [isReady, setIsReady] = useState(false);
const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

// useLayoutEffect для синхронного сброса
useLayoutEffect(() => {
  if (isOpen) {
    setDateFilter('all');
    setSelectedPhoto(null);
    setIsReady(false);
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }
}, [isOpen]);

// Прямое манипулирование DOM
useEffect(() => {
  if (isOpen) {
    buttonRefs.current.forEach(btn => {
      if (btn) {
        btn.style.pointerEvents = 'auto';
        btn.style.touchAction = 'manipulation';
      }
    });
  }
}, [isOpen]);

// useCallback для стабильности
const handleDateFilterChange = useCallback((filter: DateFilter) => {
  setDateFilter(filter);
}, []);

// Dialog с key
<Dialog
  key={isOpen ? 'open' : 'closed'}
  open={isOpen}
  onOpenChange={handleOpenChange}
>
  <DialogPrimitive.Content
    onPointerDownOutside={(e) => e.preventDefault()}
    onInteractOutside={(e) => e.preventDefault()}
    onEscapeKeyDown={(e) => e.preventDefault()}
    style={{
      willChange: 'transform, opacity',
      transform: 'translate3d(0, 0, 0)',
    }}
  >
    {/* контент */}
  </DialogPrimitive.Content>
</Dialog>

// Кнопки с disabled и ref
<button
  ref={(el) => buttonRefs.current[0] = el}
  type="button"
  disabled={!isReady}
  onClick={(e) => {
    e.stopPropagation();
    e.preventDefault();
    handleDateFilterChange('all');
  }}
>
  Все
</button>
```

**Результат:** ❌ НЕ ПОМОГЛО! На ПК версии кнопки не нажимаются и модальное окно вообще где-то в стороне. Решение сломало даже рабочую версию на ПК.

---

## 🔧 Попытка #23: Переместить кнопки фильтра в DialogHeader
**Что сделали:**
- Переместили кнопки фильтра внутрь `DialogHeader`
- Кнопки теперь в "безопасной зоне" DialogHeader, где Dialog events не так агрессивны
- Оставили `onClick` и `onPointerDown` с `stopPropagation()` на контейнере кнопок

**Изменения:**
```tsx
<DialogHeader>
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      <DialogTitle className="text-lg md:text-xl font-bold">История прихода</DialogTitle>
      <span className="text-gray-400">|</span>
      <span className="text-sm font-semibold text-gray-700">{itemName}</span>
    </div>
    <DialogPrimitive.Close className="...">
      <X className="h-4 w-4" />
      <span className="sr-only">Закрыть</span>
    </DialogPrimitive.Close>
  </div>
  
  {/* КНОПКИ ФИЛЬТРА ЗДЕСЬ - В HEADER */}
  <div
    className="flex gap-2"
    onClick={(e) => e.stopPropagation()}
    onPointerDown={(e) => e.stopPropagation()}
  >
    {/* кнопки фильтра */}
  </div>
</DialogHeader>
```

**Результат:** ❌ Не помогло. При первом открытии кнопки работают нормально, но потом перестают работать. Также замечено: когда модальное окно открывается, крестик активный как будто его выделили (в рамочке).

---

