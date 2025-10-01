Module.register("MMM-HomeConnect", {
  updated: 0,
  devices: [],
  config: null,
  authInfo: null,
  authStatus: null,
  instanceId: null,

  defaults: {
    client_ID: "",
    client_Secret: "",
    use_headless_auth: false, // Enable headless Device Flow authentication
    BaseURL: "https://api.home-connect.com/api",
    showDeviceIcon: true,
    showAlwaysAllDevices: false,
    showDeviceIfDoorIsOpen: true,
    showDeviceIfFailure: true,
    showDeviceIfInfoIsAvailable: true,
    updateFrequency: 1000 * 60 * 60
  },

  init () {
    Log.log(`${this.name} is in init!`);
  },

  start () {
    Log.log(`${this.name} is starting!`);

    // Eindeutige Instanz-ID generieren
    this.instanceId = `hc_${Math.random().toString(36)
      .substr(2, 9)}`;
    Log.log(`${this.name} instance ID: ${this.instanceId}`);

    const timer = setInterval(() => {
      this.sendSocketNotification("UPDATEREQUEST", null);
    }, this.config.updateFrequency);
  },

  loaded (callback) {
    Log.log(`${this.name} is loaded!`);
    callback();
  },

  getScripts () {
    return [];
  },

  getStyles () {
    return ["MMM-HomeConnect.css"];
  },

  getTranslations () {
    return {
      en: "translations/en.json",
      de: "translations/de.json",
      da: "translations/da.json"
    };
  },

  getHeader () {
    return "Home Connect";
  },

  notificationReceived (notification, payload, sender) {
    if (notification === "ALL_MODULES_STARTED") {
      // Config mit Instanz-ID senden
      this.sendSocketNotification("CONFIG", {
        ...this.config,
        instanceId: this.instanceId
      });
    }
  },

  socketNotificationReceived (notification, payload) {
    // Nur auf eigene Nachrichten reagieren (wenn instanceId vorhanden)
    if (payload && payload.instanceId && payload.instanceId !== this.instanceId) {
      return;
    }

    switch (notification) {
      case "MMM-HomeConnect_Update":
        this.devices = payload;
        this.updateDom();
        break;
      case "AUTH_INFO":
        // Nur aktualisieren wenn für diese Instanz oder global
        if (!payload.instanceId || payload.instanceId === this.instanceId) {
          this.authInfo = payload;
          this.updateDom();
        }
        break;
      case "AUTH_STATUS":
        // Nur aktualisieren wenn für diese Instanz oder global
        if (!payload.instanceId || payload.instanceId === this.instanceId) {
          this.authStatus = payload;
          this.updateDom();
        }
        break;
      case "INIT_STATUS":
        // Session-Status-Updates verarbeiten
        if (!payload.instanceId || payload.instanceId === this.instanceId) {
          Log.log(`${this.name} Init Status: ${payload.status} - ${payload.message}`);

          if (payload.status === "session_active" || payload.status === "complete") {
            // Session aktiv - normale Anzeige
            this.authInfo = null;
            this.authStatus = null;
            this.updateDom();
          } else if (payload.status === "auth_in_progress") {
            // Authentifizierung läuft bereits
            this.authStatus = {
              status: "polling",
              message: payload.message
            };
            this.updateDom();
          }
        }
        break;
    }
  },

  suspend () {
  },

  resume () {
  },

  getDom () {
    const div = document.createElement("div");
    let wrapper = "";
    _self = this;

    // Show authentication info if available
    if (this.authInfo && this.authInfo.status === "waiting") {
      div.innerHTML = this.getAuthHTML();
      return div;
    }

    // Show authentication status if available
    if (this.authStatus && this.authStatus.status === "polling") {
      div.innerHTML = this.getAuthStatusHTML();
      return div;
    }

    // Show error if authentication failed
    if (this.authStatus && this.authStatus.status === "error") {
      div.innerHTML = this.getAuthErrorHTML();
      return div;
    }

    // Show loading message if no devices yet
    if (!this.devices || this.devices.length == 0) {
      if (this.config.use_headless_auth) {
        div.innerHTML = "<div class='small'>" +
          "<i class='fa fa-cog fa-spin'></i> Session-based Authentication aktiv<br>" +
          `<span class='dimmed'>${_self.translate("LOADING_APPLIANCES")}...</span>` +
          "</div>";
      } else {
        div.innerHTML = `<span class='small'>${_self.translate("LOADING_APPLIANCES")}...</span>`;
      }
      return div;
    }


    // Show devices
    this.devices.forEach((device) => {
      // Compact and readable device show logic
      let IsShowDevice = false;

      if (_self.config.showAlwaysAllDevices) {
        IsShowDevice = true;
      }
      if (device.PowerState === "On") {
        IsShowDevice = true;
      }
      if (device.Lighting) {
        IsShowDevice = true;
      }
      if (_self.config.showDeviceIfDoorIsOpen && device.DoorOpen) {
        IsShowDevice = true;
      }
      if (_self.config.showDeviceIfFailure && device.Failure) {
        IsShowDevice = true;
      }
      if (_self.config.showDeviceIfInfoIsAvailable && device.Failure) {
        IsShowDevice = true;
      }

      if (IsShowDevice) {
        let ProgessBar = "";
        if (device.RemainingProgramTime > 0 && device.ProgramProgress) {
          ProgessBar = `<progress value='${device.ProgramProgress}' max='100' width='95%'></progress>`;
        }

        const StatusString =
          device.RemainingProgramTime > 0
            ? `${_self.translate("DONE_IN")} ${new Date(device.RemainingProgramTime * 1000).toISOString()
              .slice(11, 16)}`
            : "";
        const Image = `${device.type}.png`;
        const DeviceName = device.name;
        let container = "<div class='deviceContainer'>";
        if (_self.config.showDeviceIcon) {
          container += `<img src='modules/MMM-HomeConnect/Icons/${Image}' class='device_img'>`;
        }
        container += "<div class='deviceStatusIcons'>";
        [
          device.PowerState === "On" || device.PowerState === "Standby"
            ? `<i class='fa fa-plug deviceStatusIcon' title='${device.PowerState}'></i>`
            : "",
          device.DoorState === "Open"
            ? "<i class='fa fa-door-open deviceStatusIcon' title='Door Open'></i>"
            : "",
          device.Lighting === true
            ? "<i class='fa fa-lightbulb-o deviceStatusIcon' title='Light On'></i>"
            : ""
        ].forEach((icon) => {
          if (icon) {
            container += icon;
          }
        });
        container += "</div>";
        container += `<div class='deviceName bright small'>${DeviceName}<br>`;
        container += "</div>"; // End deviceName
        container += "<div></div>"; // Empty gridcell for layout
        container += `<div class='deviceStatus dimmed xsmall'>${StatusString}</div>`;
        container += `<div class='deviceProgessBar'>${ProgessBar}</div>`;
        container += "</div>"; // End deviceContainer
        if (wrapper === "") {
          wrapper = container;
        } else {
          wrapper += container;
        }
      }
    });

    if (wrapper == "") {
      wrapper = `<div class='dimmed small'>${_self.translate("NO_ACTIVE_APPLIANCES")}</div>`;
    }
    div.innerHTML = wrapper;
    return div;
  },

  getAuthHTML () {
    let html = "";
    html += "<div class='auth-container'>";
    html += "<div class='auth-header'>🔐 Home Connect Authentifizierung</div>";

    html += "<div class='auth-step'>";
    html += "<div class='auth-step-title'>📱 <strong>Schritt 1:</strong> Öffnen Sie diese URL in einem Browser:</div>";
    html += "<div class='auth-step-content'>";
    html += `<div class='auth-url'><a href='${this.authInfo.verification_uri}'>${this.authInfo.verification_uri}</a></div>`;
    html += "</div>";
    html += "</div>";

    html += "<div class='auth-step'>";
    html += "<div class='auth-step-title'>🔑 <strong>Schritt 2:</strong> Geben Sie diesen Code ein:</div>";
    html += "<div class='auth-step-content'>";
    html += `<div class='auth-code'>${this.authInfo.user_code}</div>`;
    html += "</div>";
    html += "</div>";

    html += "<div class='auth-step'>";
    html += "<div class='auth-step-title'>🔗 <strong>Oder direkter Link:</strong></div>";
    html += "<div class='auth-step-content'>";
    html += `<div class='auth-url'><a href='${this.authInfo.verification_uri_complete}'>${this.authInfo.verification_uri_complete}</a></div>`;
    html += "</div>";
    html += "</div>";

    html += "<div class='auth-footer'>";
    html += `<div class='auth-timer'>⏱️ Code läuft ab in: ${this.authInfo.expires_in_minutes} Minuten</div>`;
    html += "</div>";

    html += "<div class='auth-waiting'>Sobald Sie sich authentifiziert haben, wird automatisch fortgefahren...</div>";
    html += "</div>";

    return html;
  },

  getAuthStatusHTML () {
    let html = "";
    html += "<div class='auth-container'>";
    html += "<div class='auth-header'>⏳ Warten auf Authentifizierung</div>";

    // Progress bar
    if (this.authStatus.attempt && this.authStatus.maxAttempts) {
      const progress = Math.round(this.authStatus.attempt / this.authStatus.maxAttempts * 100);
      html += "<div class='progress-container'>";
      html += "<div class='progress-bar'>";
      html += `<div class='progress-fill' style='width: ${progress}%'></div>`;
      html += "</div>";
      html += "</div>";
    }

    html += `<div class='auth-message'>${this.authStatus.message}</div>`;

    if (this.authStatus.interval) {
      html += `<div class='auth-info'>Polling-Intervall: ${this.authStatus.interval} Sekunden</div>`;
    }

    html += "</div>";

    return html;
  },

  getAuthErrorHTML () {
    let html = "";
    html += "<div class='auth-container error'>";
    html += "<div class='auth-header'>❌ Authentifizierung fehlgeschlagen</div>";
    html += `<div class='auth-message'>${this.authStatus.message}</div>`;
    html += "<div class='auth-info'>Bitte starten Sie MagicMirror neu, um es erneut zu versuchen.</div>";
    html += "</div>";

    return html;
  }
}); // End Module
