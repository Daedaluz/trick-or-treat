package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/Daedaluz/trick-or-treat/internal/config"
	"github.com/Daedaluz/trick-or-treat/internal/store"
)

var feedbackCmd = &cobra.Command{
	Use:   "feedback",
	Short: "Read feedback left by visitors (operator only; talks to the database)",
}

var feedbackListCmd = &cobra.Command{
	Use:   "list",
	Short: "List feedback, newest first",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}
		limit, _ := cmd.Flags().GetInt("limit")
		asJSON, _ := cmd.Flags().GetBool("json")
		sinceStr, _ := cmd.Flags().GetString("since")
		var since time.Time
		if sinceStr != "" {
			since, err = time.Parse("2006-01-02", sinceStr)
			if err != nil {
				return fmt.Errorf("--since must be YYYY-MM-DD: %w", err)
			}
		}

		st, err := store.Open(cmd.Context(), cfg.DatabaseURL)
		if err != nil {
			return err
		}
		defer st.Close()
		if err := st.Migrate(cmd.Context()); err != nil {
			return err
		}
		items, err := st.ListFeedback(cmd.Context(), since, limit)
		if err != nil {
			return err
		}

		if asJSON {
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(items)
		}
		if len(items) == 0 {
			fmt.Println("no feedback yet")
			return nil
		}
		for _, f := range items {
			fmt.Printf("#%d  %s", f.ID, f.CreatedAt.Local().Format("2006-01-02 15:04"))
			if f.Contact != "" {
				fmt.Printf("  <%s>", f.Contact)
			}
			fmt.Println()
			for _, line := range strings.Split(f.Message, "\n") {
				fmt.Println("    " + line)
			}
			fmt.Println()
		}
		return nil
	},
}

func init() {
	feedbackListCmd.Flags().Int("limit", 50, "maximum number of entries")
	feedbackListCmd.Flags().String("since", "", "only entries after this date (YYYY-MM-DD)")
	feedbackListCmd.Flags().Bool("json", false, "print JSON instead of text")
	feedbackCmd.AddCommand(feedbackListCmd)
	rootCmd.AddCommand(feedbackCmd)
}
