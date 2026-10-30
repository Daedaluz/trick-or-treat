// Package cmd wires the cobra command tree.
package cmd

import (
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/Daedaluz/trick-or-treat/internal/config"
)

var rootCmd = &cobra.Command{
	Use:   "trick-or-treat",
	Short: "A map of doors that actually want trick-or-treaters",
	Long: `trick-or-treat lets households mark their door as open on Halloween,
and lets kids find those doors on a map instead of knocking at random.

Configuration is read from flags, a config file (--config) and environment
variables prefixed with TOT_, e.g. TOT_DATABASE_URL.`,
	SilenceUsage: true,
}

func init() {
	rootCmd.PersistentFlags().String("config", "", "path to a config file (yaml/toml/json)")
	_ = viper.BindPFlag("config", rootCmd.PersistentFlags().Lookup("config"))
	config.Bind(rootCmd.PersistentFlags())
}

// Execute runs the root command.
func Execute() error { return rootCmd.Execute() }
