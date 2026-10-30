// Package config loads runtime configuration from flags, environment
// variables (prefixed TOT_) and an optional config file, via viper.
package config

import (
	"strings"

	"github.com/spf13/pflag"
	"github.com/spf13/viper"
)

// Config holds everything the server needs to run.
type Config struct {
	Listen      string `mapstructure:"listen"`
	DatabaseURL string `mapstructure:"database-url"`
	UserAgent   string `mapstructure:"user-agent"`
	LogJSON     bool   `mapstructure:"log-json"`
	TrustProxy  bool   `mapstructure:"trust-proxy"`
}

// Bind registers the config flags on fs and wires them into viper.
func Bind(fs *pflag.FlagSet) {
	fs.String("listen", ":8080", "address to listen on")
	fs.String("database-url", "postgres://trick:treat@localhost:5432/trick_or_treat?sslmode=disable", "PostgreSQL connection URL")
	fs.String("user-agent", "trick-or-treat/0.1 (self-hosted; github.com/Daedaluz/trick-or-treat)", "User-Agent sent to the Nominatim geocoder")
	fs.Bool("log-json", false, "emit structured JSON logs")
	fs.Bool("trust-proxy", true, "trust X-Forwarded-For from the ingress/gateway")
	_ = viper.BindPFlags(fs)
}

// Load reads viper's merged configuration into a Config.
func Load() (*Config, error) {
	viper.SetEnvPrefix("TOT")
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
	viper.AutomaticEnv()

	if file := viper.GetString("config"); file != "" {
		viper.SetConfigFile(file)
		if err := viper.ReadInConfig(); err != nil {
			return nil, err
		}
	}

	var c Config
	if err := viper.Unmarshal(&c); err != nil {
		return nil, err
	}
	return &c, nil
}
