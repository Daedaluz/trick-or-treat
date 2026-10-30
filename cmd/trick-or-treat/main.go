// Command trick-or-treat is a map of doors that want trick-or-treaters.
package main

import (
	"os"

	"github.com/Daedaluz/trick-or-treat/internal/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
