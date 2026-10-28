# Spec Delta

## ADDED Requirements

### Requirement: Clear search on Escape
The system SHALL clear the search input and reset filters when the Escape key is pressed while the search input is focused.

#### Scenario: Escape clears search input
- Given the search input is focused and contains text
- When the user presses Escape
- Then the search input is cleared and the existing resetFilters logic runs to reset filters and reload items
