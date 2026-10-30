package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Daedaluz/trick-or-treat/internal/store"
)

// getSeason tells the client whether sign-up is open and the relevant dates.
func (h *handler) getSeason(c *gin.Context) {
	c.JSON(http.StatusOK, h.season.State(time.Now()))
}

// listDoors returns every door registered for the current year.
func (h *handler) listDoors(c *gin.Context) {
	doors, err := h.store.ListDoors(c.Request.Context(), h.season.Year(time.Now()))
	if err != nil {
		h.log.Error("list doors", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	c.JSON(http.StatusOK, doors)
}

type createDoorRequest struct {
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
	Address  string  `json:"address"`
	Unit     string  `json:"unit"`
	Intercom string  `json:"intercom_name"`
	Note     string  `json:"note"`
	OpenFrom string  `json:"open_from"`
	OpenTo   string  `json:"open_to"`
}

// createDoor registers a door and returns a one-time secret token the owner
// can use to remove it later.
func (h *handler) createDoor(c *gin.Context) {
	now := time.Now()
	if st := h.season.State(now); !st.SignupOpen {
		c.JSON(http.StatusForbidden, gin.H{"error": st.Reason, "season": st})
		return
	}

	var req createDoorRequest
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<16)
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	req.Address = strings.TrimSpace(req.Address)
	req.Unit = strings.TrimSpace(req.Unit)
	req.Intercom = strings.TrimSpace(req.Intercom)
	req.Note = strings.TrimSpace(req.Note)

	switch {
	case req.Address == "":
		c.JSON(http.StatusBadRequest, gin.H{"error": "address is required"})
		return
	case len(req.Address) > 300 || len(req.Unit) > 100 || len(req.Intercom) > 100 || len(req.Note) > 500:
		c.JSON(http.StatusBadRequest, gin.H{"error": "a field is too long"})
		return
	case req.Lat < -90 || req.Lat > 90 || req.Lng < -180 || req.Lng > 180 || (req.Lat == 0 && req.Lng == 0):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coordinates"})
		return
	case !validClock(req.OpenFrom) || !validClock(req.OpenTo):
		c.JSON(http.StatusBadRequest, gin.H{"error": "times must look like HH:MM"})
		return
	}

	token := randomHex(16)
	d := store.Door{
		ID:        randomHex(8),
		Lat:       req.Lat,
		Lng:       req.Lng,
		Address:   req.Address,
		Unit:      req.Unit,
		Intercom:  req.Intercom,
		Note:      req.Note,
		OpenFrom:  req.OpenFrom,
		OpenTo:    req.OpenTo,
		Year:      h.season.Year(now),
		CreatedAt: now.UTC(),
	}
	if err := h.store.CreateDoor(c.Request.Context(), d, hashToken(token)); err != nil {
		h.log.Error("create door", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"door": d, "token": token})
}

// deleteDoor removes a door if the caller presents the token from createDoor.
func (h *handler) deleteDoor(c *gin.Context) {
	token := c.GetHeader("X-Door-Token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing X-Door-Token header"})
		return
	}
	err := h.store.DeleteDoor(c.Request.Context(), c.Param("id"), hashToken(token))
	switch {
	case errors.Is(err, store.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "no door with that id and token"})
	case err != nil:
		h.log.Error("delete door", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
	default:
		c.Status(http.StatusNoContent)
	}
}

func validClock(s string) bool {
	if s == "" {
		return true
	}
	_, err := time.Parse("15:04", s)
	return err == nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}
