/**
 * Сервис подписания
 * Использует CryptoPro CSP и плагин для него
 * @see {@link http://www.cryptopro.ru/sites/default/files/products/cades/demopage/main.html}
 */
class WrapService {
  /**
   * @param  {Object} $q
   * @param  {Object} $window
   * @return {WrapService}
   */
  constructor($q, $window, $filter) {
    this.q = $q;
    this.window = $window;
    this.filter = $filter;
    // Инициализирован ли плагин
    this.loaded = false;
  }

  /**
  * Creates an array with all falsey values removed. The values `false`, `null`,
  * `0`, `""`, `undefined`, and `NaN` are falsey.
  * @see {@link https://github.com/lodash/lodash/blob/4.11.2/lodash.js#L6017}
  */
  _compact(array) {
    var index = -1,
        length = array ? array.length : 0,
        resIndex = 0,
        result = [];

    while (++index < length) {
      var value = array[index];
      if (value) {
        result[resIndex++] = value;
      }
    }
    return result;
  }

  /**
   * Инициализация переменных для работы с плагином
   * @private
   */
  _loadPlugin() {
    // Плагин для подписания
    this.cadesplugin = this.window.cadesplugin;
    // Хранилище текущего пользователя
    this.CAPICOM_CURRENT_USER_STORE = this.cadesplugin.CAPICOM_CURRENT_USER_STORE;
    // Хранилище персональных сертификатов пользователя
    this.CAPICOM_MY_STORE = this.cadesplugin.CAPICOM_MY_STORE;
    // Открывает хранилище на чтение/запись, если пользователь имеет права на чтение/запись.
    // Если прав на запись нет, то хранилище открывается за чтение
    this.CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED = this.cadesplugin.CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED;
    // Возвращает сертификаты, наименование которого точно или частично совпадает с указанным
    this.CAPICOM_CERTIFICATE_FIND_SUBJECT_NAME = this.cadesplugin.CAPICOM_CERTIFICATE_FIND_SUBJECT_NAME;
    // Тип подписи CAdES BES
    this.CADESCOM_CADES_BES = this.cadesplugin.CADESCOM_CADES_BES;
    // Сохранять полную цепочку
    this.CAPICOM_CERTIFICATE_INCLUDE_WHOLE_CHAIN = this.cadesplugin.CAPICOM_CERTIFICATE_INCLUDE_WHOLE_CHAIN;
    // Флаг загрузенности
    this.loaded = true;
  }

  /**
   * @typedef CertifiateDescription
   * @type Object
   * @property {String} title
   * @property {String} cn
   */
  /**
   * Собирает описание сертификата
   * @param  {String} certSubjectName
   * @param  {Date} certValidFrom
   * @return {CertifiateDescription}
   */
  _getCertDescription(certSubjectName, certValidFrom) {
    const cnPosition = certSubjectName.indexOf('CN=');
    const commaPosition = certSubjectName.indexOf(',', cnPosition);
    const cn = certSubjectName.substring(cnPosition + 3, commaPosition);
    return {
      title: `${cn}; Выдан ${this.filter('date')(certValidFrom, 'dd.MM.yyyy')}`,
      cn: certSubjectName
    };
  }

  /**
   * Получение списка сертификатов пользователя
   * @return {Promise.<{}>}
   */
  getCertsList() {
    const self = this;
    if (!this.loaded) {
      this._loadPlugin();
    }
    // Хранилище сертификатов
    let oStore;
    // Список сертификатов в пользовательском хранилище
    let oCerts;
    return self.cadesplugin.CreateObjectAsync("CAPICOM.Store")
      .then(store => {
        oStore = store;
        // Открываем соединение
        oStore.Open(self.CAPICOM_CURRENT_USER_STORE, self.CAPICOM_MY_STORE,
          self.CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED);
        // Вычитываем сертификаты
        return oStore.Certificates;
      })
      .then(certs => {
        oCerts = certs;
        // Полчучаем кол-во доступных сертификатов
        return certs.Count;
      })
      .then(count => {
        // Проверяем что есть доступные сертификаты
        if (!count) {
          return self.q.reject('No certs found');
        }
        // Массив обработчиков для каждого сертификата
        const promises = [];
        // Теукщая дата
        const currentDate = new Date();
        // Для ускорения получения информации о сертификат
        // делаем всё через массив промисов
        /*jshint loopfunc: true */
        for (let i = 1; i <= count; i++) {
          (function (i) {
            promises.push(self.q((resolve, reject) => {
              let oCert;
              let certDate;
              let certIsValid;
              return oCerts.Item(i)
                .then(cert => {
                  oCert = cert;
                  // Вытаскиваем дату окончания сертфиката
                  return oCert.ValidToDate;
                })
                .then(date => {
                  certDate = new Date(date);
                  // Валидатор сертификата
                  return oCert.IsValid();
                })
                // Результат валидности
                .then(validator => validator.Result)
                .then(isValid => {
                  certIsValid = isValid;
                  // Проверяем есть ли у сертификата закрытый ключ
                  return oCert.HasPrivateKey();
                })
                .then(hasPrivateKey => {
                  if (hasPrivateKey && certIsValid && currentDate < certDate) {
                    return oCert.SubjectName
                      .then(subjectName => {
                        return resolve(self._getCertDescription(subjectName, certDate));
                      });
                  }
                  return resolve(null);
                });
            }));
          }(i));
        }
        return self.q.all(promises)
          .then(list => self._compact(list));
      });
  }

  /**
   * Подписать
   * @param  {String} certSubjectName Наиманование сертификата
   * @param  {String} dataToSign Данные для подписи
   * @return {Promise.<String>} Подпись
   */
  sign(dataToSign = 'Hello World', certSubjectName = '') {
    const self = this;
    if (!this.loaded) {
      this._loadPlugin();
    }
    // Хранилище сертификатов
    let oStore;
    // Список сертификатов в пользовательском хранилище
    let oCerts;
    // Выбранный сертификат
    let oCert;
    // Подписыватель
    let oSigner;
    // Подписанные данные
    let oSignedData;
    // Создаём соединение с хранилищем сертификатов
    return self.cadesplugin.CreateObjectAsync("CAPICOM.Store")
      .then(store => {
        oStore = store;
        // Открываем соединение
        oStore.Open(self.CAPICOM_CURRENT_USER_STORE, self.CAPICOM_MY_STORE,
          self.CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED);
        // Вычитываем сертификаты
        return oStore.Certificates;
      })
      .then(certs => {
        // Если есть параметр для фильтрации - ищем
        return (!certSubjectName) ?
          certs : certs.Find(CAPICOM_CERTIFICATE_FIND_SUBJECT_NAME, certSubjectName);
      })
      .then((certs) => {
        oCerts = certs;
        // Полчучаем кол-во доступных сертификатов
        return certs.Count;
      })
      .then(count => {
        // Проверяем что есть доступные сертификаты
        if (!count) {
          return self.q.reject('No certs found');
        }
        // И что особо выбора у нас нет
        if (count > 1) {
          return self.q.reject(`Specify certificate name. Found: ${count} certs`);
        }
        return self.q.resolve();
      })
      // Берём первый сертификат
      .then(() => oCerts.Item(1))
      .then(cert => {
        oCert = cert;
      })
      // Создаём объект подписи
      .then(() => self.cadesplugin.CreateObjectAsync('CAdESCOM.CPSigner'))
      .then(signer => {
        oSigner = signer;
        // Указываем какой сертификат использовать
        return oSigner.propset_Certificate(oCert);
      })
      // Создаём объект подписанный данных
      .then(() => self.cadesplugin.CreateObjectAsync('CAdESCOM.CadesSignedData'))
      .then(signerData => {
        oSignedData = signerData;
        // Указываем что надо подписать
        return oSignedData.propset_Content(dataToSign);
      })
      // Устанавливаем дополнительные параметры подписания
      .then(() => oSigner.propset_Options(self.CAPICOM_CERTIFICATE_INCLUDE_WHOLE_CHAIN))
      // Подписываем данные
      .then(() => oSignedData.SignCades(oSigner, self.CADESCOM_CADES_BES))
      .then(signature => {
        // Закрываем соединение
        oStore.Close();
        // Возвращаем подпись
        return signature;
      });
  }
}

// Injection
WrapService.$inject = ['$q', '$window', '$filter'];

export default WrapService;
