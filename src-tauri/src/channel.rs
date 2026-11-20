//! Build channels.
//!
//! One codebase, three flavors, told apart by the app identifier:
//!
//! | channel    | identifier                   | built by                         |
//! |------------|------------------------------|----------------------------------|
//! | dev        | `app.kinlo.desktop.dev`      | `npm run app:dev` on your machine |
//! | staging    | `app.kinlo.desktop.staging`  | pushes to the `staging` branch   |
//! | production | `app.kinlo.desktop`          | `v*` tags on `main`              |
//!
//! The OS data directory is derived from the identifier, so each channel gets its own
//! SQLite file. Anything else that must not leak between channels (the keychain service
//! name, for one) must be derived from the identifier too. Use [`Channel::keychain_service`].

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Channel {
    Dev,
    Staging,
    Production,
}

pub const PRODUCTION_IDENTIFIER: &str = "app.kinlo.desktop";

impl Channel {
    pub fn from_identifier(identifier: &str) -> Self {
        match identifier.strip_prefix(PRODUCTION_IDENTIFIER) {
            Some("") => Channel::Production,
            Some(".staging") => Channel::Staging,
            // Unknown identifiers are never treated as production.
            _ => Channel::Dev,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Channel::Dev => "dev",
            Channel::Staging => "staging",
            Channel::Production => "production",
        }
    }

    pub fn window_title(self) -> &'static str {
        match self {
            Channel::Dev => "kinlo dev",
            Channel::Staging => "kinlo staging",
            Channel::Production => "kinlo",
        }
    }

    /// Keychain service name. Separate per channel so a staging build can never read or
    /// overwrite the API keys of the production app.
    #[allow(dead_code)] // used by the keychain commands in step 6
    pub fn keychain_service(self) -> &'static str {
        match self {
            Channel::Dev => "app.kinlo.desktop.dev",
            Channel::Staging => "app.kinlo.desktop.staging",
            Channel::Production => PRODUCTION_IDENTIFIER,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_identifiers_to_channels() {
        assert_eq!(
            Channel::from_identifier("app.kinlo.desktop"),
            Channel::Production
        );
        assert_eq!(
            Channel::from_identifier("app.kinlo.desktop.staging"),
            Channel::Staging
        );
        assert_eq!(
            Channel::from_identifier("app.kinlo.desktop.dev"),
            Channel::Dev
        );
    }

    #[test]
    fn unknown_identifiers_are_not_production() {
        assert_eq!(
            Channel::from_identifier("app.kinlo.desktop.nightly"),
            Channel::Dev
        );
        assert_eq!(Channel::from_identifier("app.kinlo.desktopx"), Channel::Dev);
        assert_eq!(Channel::from_identifier("com.example"), Channel::Dev);
        assert_eq!(Channel::from_identifier(""), Channel::Dev);
    }

    #[test]
    fn channels_never_share_a_keychain_service() {
        let all = [Channel::Dev, Channel::Staging, Channel::Production];
        for a in all {
            for b in all {
                if a != b {
                    assert_ne!(a.keychain_service(), b.keychain_service());
                }
            }
            // The service name round-trips to the same channel.
            assert_eq!(Channel::from_identifier(a.keychain_service()), a);
        }
    }
}
