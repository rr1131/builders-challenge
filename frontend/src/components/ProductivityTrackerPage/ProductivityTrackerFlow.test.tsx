/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom'
import { MockedProvider, MockedResponse } from '@apollo/client/testing'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProjectPage from 'components/App/ProjectPages'
import AddTaskPage from 'components/ProductivityTrackerPage/AddTaskPage'
import ProductivityPage from 'components/ProductivityTrackerPage/ProductivityPage'
import React from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import {
  CREATE_TASK_MUTATION,
  DELETE_TASK_MUTATION,
  GENERATE_WEEKLY_SUMMARY_MUTATION,
  GET_TASKS_QUERY,
  GET_WEEKLY_SUMMARY_QUERY,
  GET_WEEKLY_SUMMARY_SEARCH_QUERY
} from './graphql'

jest.mock('components/Menu/MenuWrap', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

// Codex generated flow tests to cover the tracker’s primary UI path from task logging
// through weekly review, summary states, and historical search.
const currentWeekRange = {
  weekStart: '2026-06-15',
  weekEnd: '2026-06-21'
}

const previousWeekRange = {
  weekStart: '2026-06-08',
  weekEnd: '2026-06-14'
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-06-20T12:00:00'))
})

afterEach(() => {
  jest.useRealTimers()
  window.history.replaceState({}, '', '/')
})

test('add task page validates required fields before saving', async () => {
  renderWithRouter(
    <AddTaskPage />,
    {
      initialEntries: [ProjectPage.ProductivityTrackerAddTask]
    }
  )

  fireEvent.change(screen.getByLabelText('Task title'), { target: { value: '   ' } })
  fireEvent.change(screen.getByLabelText('Hours spent'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save task' }))

  expect(await screen.findByText('Please enter a task title.')).toBeInTheDocument()
  expect(screen.getByText('Hours spent must be greater than 0.')).toBeInTheDocument()
})

test('add task page saves and redirects back to the tracker route', async () => {
  const createdTask = buildTask({
    id: '1',
    title: 'Ship dashboard filters',
    finishDate: '2026-06-21',
    notes: 'Completed during deep work block.'
  })

  const mocks: MockedResponse[] = [
    {
      request: {
        query: CREATE_TASK_MUTATION,
        variables: {
          task: {
            title: 'Ship dashboard filters',
            finishDate: '2026-06-21',
            category: 'coding',
            hoursSpent: 1.5,
            focusLevel: 6,
            notes: 'Completed during deep work block.'
          }
        }
      },
      result: {
        data: {
          createTask: createdTask
        }
      }
    },
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: {}
      },
      result: {
        data: {
          tasks: [createdTask]
        }
      }
    },
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [createdTask]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: null
        }
      }
    }
  ]

  renderWithRouter(
    <AddTaskPage />,
    {
      initialEntries: [ProjectPage.ProductivityTrackerAddTask],
      mocks,
      includeRoutes: true
    }
  )

  fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Ship dashboard filters' } })
  fireEvent.change(screen.getByLabelText('Finish Date'), { target: { value: '2026-06-21' } })
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Completed during deep work block.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save task' }))

  await waitFor(() => {
    expect(screen.getByText('Dashboard destination')).toBeInTheDocument()
  })
})

test('landing page renders the refreshed tracker header and inline search', async () => {
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [
            buildTask({
              id: '1',
              title: 'Ship dashboard filters',
              finishDate: '2026-06-18',
              category: 'coding',
              hoursSpent: 2,
              focusLevel: 8,
              notes: 'Completed during deep work block.'
            })
          ]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary({
            weekStart: currentWeekRange.weekStart,
            weekEnd: currentWeekRange.weekEnd,
            summaryParagraph: 'This week featured focused coding work and steady execution.'
          })
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  expect(screen.getByRole('heading', { name: 'Productivity Tracker' })).toBeInTheDocument()
  expect(screen.getByText(/Track your tasking and get full visibility/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Log task' })).toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: 'Search saved summaries' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Week at a Glance' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Calendar view' })).toBeInTheDocument()
  expect(await screen.findByText('Filtered productivity trend')).toBeInTheDocument()
  expect(screen.getByText('This week featured focused coding work and steady execution.')).toBeInTheDocument()
  expect(screen.queryByText('Ship dashboard filters')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View previous week' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View next week' })).toBeInTheDocument()
  expect(screen.getByText((content, node) => node?.textContent === 'Total tasks1 🧊')).toBeInTheDocument()
})

test('landing page week switcher loads prior week data and returns to this week', async () => {
  const currentTask = buildTask({
    id: '1',
    title: 'Ship dashboard filters',
    finishDate: '2026-06-18',
    category: 'coding',
    hoursSpent: 2,
    focusLevel: 8
  })
  const previousTask = buildTask({
    id: '2',
    title: 'Map research themes',
    finishDate: '2026-06-11',
    category: 'research',
    hoursSpent: 3,
    focusLevel: 7
  })
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [currentTask]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary({
            weekStart: currentWeekRange.weekStart,
            weekEnd: currentWeekRange.weekEnd,
            summaryParagraph: 'This week featured focused coding work and steady execution.'
          })
        }
      }
    },
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: previousWeekRange
      },
      result: {
        data: {
          tasks: [previousTask]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: previousWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary({
            weekStart: previousWeekRange.weekStart,
            weekEnd: previousWeekRange.weekEnd,
            summaryParagraph: 'Last week leaned more heavily on research and documentation.'
          })
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  expect(await screen.findByText('This week featured focused coding work and steady execution.')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'View previous week' }))

  expect(await screen.findByText('Last week leaned more heavily on research and documentation.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'This week' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'This week' }))

  expect(await screen.findByText('This week featured focused coding work and steady execution.')).toBeInTheDocument()
})

test('calendar view sorts same-day tasks by hours and category filters narrow the visible tasks', async () => {
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [
            buildTask({
              id: '1',
              title: 'Quick admin cleanup',
              finishDate: '2026-06-18',
              category: 'admin',
              hoursSpent: 1,
              focusLevel: 4
            }),
            buildTask({
              id: '2',
              title: 'Build reporting flow',
              finishDate: '2026-06-18',
              category: 'coding',
              hoursSpent: 4,
              focusLevel: 8
            }),
            buildTask({
              id: '3',
              title: 'Sprint planning',
              finishDate: '2026-06-19',
              category: 'planning',
              hoursSpent: 2,
              focusLevel: 5
            })
          ]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary()
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  expect(await screen.findByText('Filtered productivity trend')).toBeInTheDocument()
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'Show breakdown for Thu' }))
  expect(await screen.findByText('💻 Coding')).toBeInTheDocument()
  expect(screen.getByText('80% · 4h')).toBeInTheDocument()
  expect(screen.getByText('✍️ Admin')).toBeInTheDocument()
  expect(screen.getByText('20% · 1h')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Calendar view' }))

  expect(await screen.findByText('Build reporting flow')).toBeInTheDocument()
  const taskTitles = screen.getAllByText(/Build reporting flow|Quick admin cleanup|Sprint planning/).map(node => node.textContent)
  expect(taskTitles[0]).toBe('Build reporting flow')
  expect(taskTitles[1]).toBe('Quick admin cleanup')

  fireEvent.click(screen.getByRole('button', { name: 'Admin' }))

  expect(screen.queryByText('Quick admin cleanup')).not.toBeInTheDocument()
  expect(screen.getByText('Build reporting flow')).toBeInTheDocument()
})

test('calendar view makes each task card open the edit flow', async () => {
  const startingTasks = [
    buildTask({
      id: '1',
      title: 'Build reporting flow',
      finishDate: '2026-06-18',
      category: 'coding',
      hoursSpent: 4,
      focusLevel: 8
    }),
    buildTask({
      id: '2',
      title: 'Quick admin cleanup',
      finishDate: '2026-06-18',
      category: 'admin',
      hoursSpent: 1,
      focusLevel: 4
    })
  ]
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: startingTasks
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary({
            taskSignature: buildTaskSignature(startingTasks)
          })
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  expect(await screen.findByText('Filtered productivity trend')).toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'Calendar view' }))

  expect(await screen.findByText('Build reporting flow')).toBeInTheDocument()
  expect(screen.getByText('Build reporting flow').closest('a')).toHaveAttribute('href', '/productivity/tasks/1/edit')
  expect(screen.getByText('Quick admin cleanup').closest('a')).toHaveAttribute('href', '/productivity/tasks/2/edit')
})

test('edit page can delete a task and return to the tracker route', async () => {
  const taskToDelete = buildTask({
    id: '2',
    title: 'Quick admin cleanup',
    finishDate: '2026-06-18',
    category: 'admin',
    hoursSpent: 1,
    focusLevel: 4
  })
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
  const mocks: MockedResponse[] = [
    {
      request: {
        query: DELETE_TASK_MUTATION,
        variables: {
          id: '2'
        }
      },
      result: {
        data: {
          deleteTask: taskToDelete
        }
      }
    },
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: []
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary({
            taskSignature: buildTaskSignature([taskToDelete])
          })
        }
      }
    }
  ]

  renderWithRouter(
    <AddTaskPage />,
    {
      initialEntries: [{ pathname: '/productivity/tasks/2/edit', state: { task: taskToDelete } }],
      mocks,
      includeRoutes: true
    }
  )

  expect(await screen.findByDisplayValue('Quick admin cleanup')).toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'Delete task' }))

  await waitFor(() => {
    expect(screen.getByText('Dashboard destination')).toBeInTheDocument()
  })

  confirmSpy.mockRestore()
})

test('focus level filter narrows the display when focus mode is selected', async () => {
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [
            buildTask({
              id: '1',
              title: 'Deep implementation session',
              finishDate: '2026-06-18',
              category: 'coding',
              hoursSpent: 3,
              focusLevel: 9
            }),
            buildTask({
              id: '2',
              title: 'Inbox triage',
              finishDate: '2026-06-18',
              category: 'admin',
              hoursSpent: 1,
              focusLevel: 2
            })
          ]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary()
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  expect(await screen.findByText('Filtered productivity trend')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Calendar view' }))
  expect(await screen.findByText('Deep implementation session')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Focus level' }))
  fireEvent.click(screen.getByRole('button', { name: 'Low Focus' }))

  expect(screen.queryByText('Inbox triage')).not.toBeInTheDocument()
  expect(screen.getByText('Deep implementation session')).toBeInTheDocument()
})

test('landing page initializes the selected week from the url query param', async () => {
  const previousTask = buildTask({
    id: '2',
    title: 'Map research themes',
    finishDate: '2026-06-11',
    category: 'research',
    hoursSpent: 3,
    focusLevel: 7
  })
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: previousWeekRange
      },
      result: {
        data: {
          tasks: [previousTask]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: previousWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary({
            weekStart: previousWeekRange.weekStart,
            weekEnd: previousWeekRange.weekEnd,
            summaryParagraph: 'Last week leaned more heavily on research and documentation.'
          })
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [`${ProjectPage.ProductivityTracker}?date=${previousWeekRange.weekStart}`],
      mocks,
      reportLocation: true
    }
  )

  expect(await screen.findByText('Last week leaned more heavily on research and documentation.')).toBeInTheDocument()
  expect(screen.getByText('Jun 8 - 14, 2026')).toBeInTheDocument()
  expect(screen.getByTestId('location-display')).toHaveTextContent('/productivity?date=2026-06-08')
})

test('homepage search uses backend summary results and clicking a result switches the selected week', async () => {
  const currentTask = buildTask({
    id: '1',
    title: 'Ship dashboard filters',
    finishDate: '2026-06-18',
    category: 'coding',
    hoursSpent: 2,
    focusLevel: 8
  })
  const previousTask = buildTask({
    id: '2',
    title: 'Map research themes',
    finishDate: '2026-06-11',
    category: 'research',
    hoursSpent: 3,
    focusLevel: 7
  })
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [currentTask]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary()
        }
      }
    },
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: previousWeekRange
      },
      result: {
        data: {
          tasks: [previousTask]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: previousWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary({
            weekStart: previousWeekRange.weekStart,
            weekEnd: previousWeekRange.weekEnd,
            summaryParagraph: 'Last week leaned more heavily on research and documentation.',
            metrics: {
              taskCount: 3,
              totalHours: 7,
              averageFocusLevel: 7,
              topCategory: 'research',
              busiestDay: 'Thursday',
              __typename: 'WeeklySummaryMetrics'
            }
          })
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_SEARCH_QUERY,
        variables: {
          query: 'week'
        }
      },
      result: {
        data: {
          searchWeeklySummaries: [
            buildSearchResult(),
            buildSearchResult({
              weeklySummary: buildSummary({
                weekStart: previousWeekRange.weekStart,
                weekEnd: previousWeekRange.weekEnd,
                summaryParagraph: 'Last week leaned more heavily on research and documentation.',
                metrics: {
                  taskCount: 3,
                  totalHours: 7,
                  averageFocusLevel: 7,
                  topCategory: 'research',
                  busiestDay: 'Thursday',
                  __typename: 'WeeklySummaryMetrics'
                }
              }),
              matchedTerms: ['week'],
              score: 0.811
            })
          ]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_SEARCH_QUERY,
        variables: {
          query: 'research heavy week'
        }
      },
      result: {
        data: {
          searchWeeklySummaries: [
            buildSearchResult({
              weeklySummary: buildSummary({
                weekStart: previousWeekRange.weekStart,
                weekEnd: previousWeekRange.weekEnd,
                summaryParagraph: 'Last week leaned more heavily on research and documentation.',
                metrics: {
                  taskCount: 3,
                  totalHours: 7,
                  averageFocusLevel: 7,
                  topCategory: 'research',
                  busiestDay: 'Thursday',
                  __typename: 'WeeklySummaryMetrics'
                }
              }),
              matchedTerms: ['research'],
              score: 0.944
            })
          ]
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks,
      reportLocation: true
    }
  )

  expect(await screen.findByText('This week featured focused coding work and steady execution.')).toBeInTheDocument()

  const searchInput = screen.getByRole('searchbox', { name: 'Search saved summaries' })
  fireEvent.focus(searchInput)
  fireEvent.change(searchInput, { target: { value: 'research heavy week' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))

  expect(await screen.findByRole('button', { name: 'Open week Jun 8 - 14, 2026' })).toBeInTheDocument()
  expect(screen.getByText('Match score 0.94')).toBeInTheDocument()
  expect(screen.getByText('research')).toBeInTheDocument()
  expect(screen.queryByText('3 tasks · 7h · avg focus 7 · busiest Thursday')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open week Jun 8 - 14, 2026' }))

  expect(await screen.findByText('Last week leaned more heavily on research and documentation.')).toBeInTheDocument()
  expect(screen.getByTestId('location-display')).toHaveTextContent('/productivity?date=2026-06-08')
})

test('homepage search shows the no-summaries state when nothing has been generated yet', async () => {
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: []
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: null
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_SEARCH_QUERY,
        variables: {
          query: 'week'
        }
      },
      result: {
        data: {
          searchWeeklySummaries: []
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  const searchInput = screen.getByRole('searchbox', { name: 'Search saved summaries' })
  fireEvent.focus(searchInput)

  expect(await screen.findByText('No summaries yet')).toBeInTheDocument()
  expect(screen.getByText(/Generate a weekly summary from Week at a Glance/i)).toBeInTheDocument()
})

test('homepage search refreshes availability after generating the first summary', async () => {
  const generatedSummary = buildSummary({
    weekStart: currentWeekRange.weekStart,
    weekEnd: currentWeekRange.weekEnd,
    summaryParagraph: 'This week leaned heavily on coding work with steady focus.'
  })

  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [buildTask()]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: null
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_SEARCH_QUERY,
        variables: {
          query: 'week'
        }
      },
      result: {
        data: {
          searchWeeklySummaries: []
        }
      }
    },
    {
      request: {
        query: GENERATE_WEEKLY_SUMMARY_MUTATION,
        variables: currentWeekRange
      },
      result: {
        data: {
          generateWeeklySummary: generatedSummary
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: generatedSummary
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_SEARCH_QUERY,
        variables: {
          query: 'week'
        }
      },
      result: {
        data: {
          searchWeeklySummaries: [buildSearchResult({
            weeklySummary: generatedSummary,
            matchedTerms: ['week']
          })]
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  expect(await screen.findByRole('button', { name: 'Generate summary' })).toBeInTheDocument()

  const searchInput = screen.getByRole('searchbox', { name: 'Search saved summaries' })
  fireEvent.focus(searchInput)

  expect(await screen.findByText('No summaries yet')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))

  expect(await screen.findByText('This week leaned heavily on coding work with steady focus.')).toBeInTheDocument()

  fireEvent.focus(screen.getByRole('searchbox', { name: 'Search saved summaries' }))

  expect(await screen.findByText(/Search saved summaries by category, focus pattern, or workload/i)).toBeInTheDocument()
})

test('homepage search surfaces backend errors from the real summary query', async () => {
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [buildTask()]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary()
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_SEARCH_QUERY,
        variables: {
          query: 'week'
        }
      },
      result: {
        data: {
          searchWeeklySummaries: [buildSearchResult()]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_SEARCH_QUERY,
        variables: {
          query: 'coding focus'
        }
      },
      error: new Error('Backend unavailable')
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  const searchInput = screen.getByRole('searchbox', { name: 'Search saved summaries' })
  fireEvent.focus(searchInput)
  fireEvent.change(searchInput, { target: { value: 'coding focus' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))

  expect(await screen.findByText('Backend unavailable')).toBeInTheDocument()
})

test('landing page shows the empty selected-week state and hides summary generation when no tasks exist', async () => {
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [buildTask({ id: '1', title: 'Ship dashboard filters', finishDate: '2026-06-18' })]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: null
        }
      }
    },
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: previousWeekRange
      },
      result: {
        data: {
          tasks: []
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: previousWeekRange
      },
      result: {
        data: {
          weeklySummary: null
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  expect(await screen.findByRole('button', { name: 'Generate summary' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'View previous week' }))

  expect(await screen.findByText('No completed tasks in this week yet.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Generate summary' })).not.toBeInTheDocument()
})

test('landing page shows stale summary messaging when tasks changed after generation', async () => {
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [
            buildTask({
              id: '1',
              title: 'Ship dashboard filters',
              finishDate: '2026-06-18',
              updatedAt: '2026-06-21T18:00:00.000Z'
            })
          ]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary({
            weekStart: currentWeekRange.weekStart,
            weekEnd: currentWeekRange.weekEnd,
            generatedAt: '2026-06-20T09:00:00.000Z'
          })
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  fireEvent.click(await screen.findByRole('button', { name: 'Week at a Glance' }))

  expect(await screen.findByText(/Tasks changed after the latest summary was generated/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Regenerate summary' })).toBeInTheDocument()
})

test('landing page structures the weekly summary with metrics, recap, and suggestion details', async () => {
  const mocks: MockedResponse[] = [
    {
      request: {
        query: GET_TASKS_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          tasks: [buildTask()]
        }
      }
    },
    {
      request: {
        query: GET_WEEKLY_SUMMARY_QUERY,
        variables: currentWeekRange
      },
      result: {
        data: {
          weeklySummary: buildSummary({
            suggestions: [
              'Protect deep work: Keep your mornings clear for focused execution.',
              'Batch admin time: Group small operational tasks into one block.'
            ],
            metrics: {
              taskCount: 4,
              totalHours: 8.5,
              averageFocusLevel: 5.8,
              topCategory: 'admin',
              busiestDay: 'Sunday',
              __typename: 'WeeklySummaryMetrics'
            }
          })
        }
      }
    }
  ]

  renderWithRouter(
    <ProductivityPage />,
    {
      initialEntries: [ProjectPage.ProductivityTracker],
      mocks
    }
  )

  fireEvent.click(await screen.findByRole('button', { name: 'Week at a Glance' }))

  expect(await screen.findByText('Tasks:')).toBeInTheDocument()
  expect(screen.getByText((content, node) => node?.textContent === 'Total tasks1 🧊')).toBeInTheDocument()
  expect(screen.getByText((content, node) => node?.textContent === 'Total hours1.5h 🧊')).toBeInTheDocument()
  expect(screen.getByText((content, node) => node?.textContent === 'Focus level6/10 ⚡')).toBeInTheDocument()
  expect(screen.getByText('8.5')).toBeInTheDocument()
  expect(screen.getByText((content, node) => node?.textContent === 'Top Category: Admin')).toBeInTheDocument()
  expect(screen.getByText('This week featured focused coding work and steady execution.')).toBeInTheDocument()
  expect(screen.getByText('Suggestions')).toBeInTheDocument()
  expect(screen.getByText('Protect deep work')).toBeInTheDocument()
  expect(screen.getByText(': Keep your mornings clear for focused execution.')).toBeInTheDocument()
})

/**
 * Builds a task fixture for frontend tracker-flow tests.
 *
 * @param overrides Partial values to customize the task.
 * @returns Task fixture.
 */
function buildTask (overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: '1',
    title: 'Ship dashboard filters',
    finishDate: '2026-06-18',
    category: 'coding',
    hoursSpent: 1.5,
    focusLevel: 6,
    notes: '',
    createdAt: '2026-06-20T16:00:00.000Z',
    updatedAt: '2026-06-20T16:00:00.000Z',
    __typename: 'Task',
    ...overrides
  }
}

/**
 * Builds a weekly summary fixture for frontend tracker-flow tests.
 *
 * @param overrides Partial values to customize the summary.
 * @returns Weekly summary fixture.
 */
function buildSummary (overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    weekStart: currentWeekRange.weekStart,
    weekEnd: currentWeekRange.weekEnd,
    summaryParagraph: 'This week featured focused coding work and steady execution.',
    suggestions: ['Keep protecting deep work blocks.', 'Front-load the highest-focus tasks.'],
    generatedAt: '2026-06-20T16:00:00.000Z',
    taskSignature: buildTaskSignature([buildTask()]),
    metrics: {
      taskCount: 1,
      totalHours: 2,
      averageFocusLevel: 8,
      topCategory: 'coding',
      busiestDay: 'Thursday',
      __typename: 'WeeklySummaryMetrics'
    },
    __typename: 'WeeklySummary',
    ...overrides
  }
}

/**
 * Recreates the frontend task-signature logic for stale-summary tests.
 *
 * @param tasks Task fixtures used in the summary.
 * @returns Stable task signature string.
 */
function buildTaskSignature (tasks: Array<Record<string, any>>): string {
  return tasks
    .map(task => `${String(task.id)}:${String(task.updatedAt ?? '')}`)
    .sort((left, right) => left.localeCompare(right))
    .join('|')
}

/**
 * Builds a historical-search result fixture for inline search tests.
 *
 * @param overrides Partial values to customize the result.
 * @returns Search-result fixture.
 */
function buildSearchResult (overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    score: 0.932,
    matchedTerms: ['coding'],
    weeklySummary: buildSummary(),
    __typename: 'WeeklySummarySearchResult',
    ...overrides
  }
}

/**
 * Reports the current router location for navigation assertions.
 *
 * @returns Rendered location string.
 */
function LocationReporter (): React.ReactElement {
  const location = useLocation()

  return <div data-testid='location-display'>{`${location.pathname}${location.search}`}</div>
}

/**
 * Renders the tracker UI under a mocked Apollo provider and memory router.
 *
 * @param ui Root element to render.
 * @param options Router and Apollo configuration for the test.
 * @returns React Testing Library render result.
 */
function renderWithRouter (
  ui: React.ReactElement,
  options: {
    initialEntries: any[]
    mocks?: MockedResponse[]
    includeRoutes?: boolean
    reportLocation?: boolean
  }
): ReturnType<typeof render> {
  return render(
    <MockedProvider mocks={options.mocks ?? []} addTypename={false}>
      <MemoryRouter initialEntries={options.initialEntries}>
        {options.reportLocation === true && <LocationReporter />}
        {options.includeRoutes === true
          ? (
            <Routes>
              <Route path={ProjectPage.ProductivityTrackerAddTask} element={ui} />
              <Route path={ProjectPage.ProductivityTrackerEditTask} element={ui} />
              <Route path={ProjectPage.ProductivityTracker} element={<div>Dashboard destination</div>} />
            </Routes>
            )
          : ui}
      </MemoryRouter>
    </MockedProvider>
  )
}
