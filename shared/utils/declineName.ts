import petrovich from 'petrovich';

/**
 * Определяет пол по русскому имени
 * @param name - Имя
 * @returns 'male' или 'female'
 */
function detectGender(name: string): 'male' | 'female' {
  if (!name) return 'male';
  
  const trimmedName = name.trim().toLowerCase();
  const lastChar = trimmedName.slice(-1);
  
  // Женские имена обычно заканчиваются на -а, -я
  if (lastChar === 'а' || lastChar === 'я') {
    // Исключения: мужские имена на -а (Никита, Илья, Саша, Паша и т.д.)
    const maleExceptions = ['никита', 'илья', 'саша', 'паша', 'коля', 'дима', 'юра', 'сережа', 'андрей', 'сергей', 'алексей', 'николай', 'максим', 'иван', 'дмитрий', 'александр', 'михаил', 'юрий', 'григорий', 'виктор', 'игорь', 'павел', 'евгений', 'валентин', 'владимир', 'анатолий', 'константин', 'вячеслав', 'станислав', 'владислав', 'роман', 'олег', 'артем', 'артём', 'антон', 'денис', 'виталий', 'глеб', 'кирилл', 'тимофей', 'федор', 'фёдор', 'ярослав', 'борис', 'геннадий', 'лев', 'марк', 'матвей', 'ростислав', 'руслан', 'святослав', 'тимур', 'эдуард', 'юлиан'];
    
    if (maleExceptions.includes(trimmedName)) {
      return 'male';
    }
    
    return 'female';
  }
  
  return 'male';
}

/**
 * Склоняет русское имя в указанный падеж
 * @param name - Имя в именительном падеже
 * @param gender - Пол: 'male' или 'female' (опционально, определяется автоматически)
 * @param caseName - Падеж: 'nominative', 'genitive', 'dative', 'accusative', 'instrumental', 'prepositional'
 * @returns Имя в указанном падеже
 */
export function declineName(
  name: string,
  gender?: 'male' | 'female',
  caseName: 'nominative' | 'genitive' | 'dative' | 'accusative' | 'instrumental' | 'prepositional' = 'instrumental'
): string {
  if (!name) return name;

  try {
    const detectedGender = gender || detectGender(name);
    
    // petrovich использует цепочку методов: petrovich[gender][nameType][case]
    // Пример: petrovich.male.first.genitive('Андрей')
    if (petrovich[detectedGender] && petrovich[detectedGender].first && petrovich[detectedGender].first[caseName]) {
      const result = petrovich[detectedGender].first[caseName](name);
      return result || name;
    }
    
    return name;
  } catch (error) {
    console.error('Ошибка при склонении имени:', error);
    return name;
  }
}

/**
 * Склоняет имя в творительный падеж (с кем? - с кем?)
 * @param name - Имя в именительном падеже
 * @param gender - Пол: 'male' или 'female' (опционально, определяется автоматически)
 * @returns Имя в творительном падеже
 */
export function declineNameInstrumental(name: string, gender?: 'male' | 'female'): string {
  try {
    return declineName(name, gender, 'instrumental');
  } catch (error) {
    console.error('Ошибка при склонении имени в творительный падеж:', error);
    return name;
  }
}
