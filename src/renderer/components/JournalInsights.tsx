/**
 * DEX Journal Insights - Contextual suggestions and analysis panel
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Displays:
 * - "What you were working on" session summary
 * - "Unfinished from last session" with context
 * - "Most used tools today" ranked list
 * - Detected cross-app patterns
 * - Usage anomaly alerts
 * - Weekly report summary
 */

import React, { useEffect, useState, memo } from 'react';
import { useJournalStore, type JournalInsight, type CrossAppPattern, type UsageAnomaly, type WeeklyReport } from '../store/journalStore';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    padding: 'var(--space-3)',
    gap: 'var(--space-3)',
  },
  sectionTitle: {
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    marginBottom: 4,
  },
  card: {
    padding: 'var(--space-2) 10px',
    borderRadius: 4,
    border: '1px solid var(--color-bg-hover)',
    background: 'var(--color-border-subtle)',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: 2,
  },
  cardBody: {
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    lineHeight: '1.4',
  },
  insightIcon: {
    display: 'inline-block',
    width: 14,
    height: 14,
    borderRadius: 2,
    marginRight: 6,
    textAlign: 'center' as const,
    fontSize: 9,
    lineHeight: '14px',
    fontWeight: 700,
    flexShrink: 0,
  },
  patternPill: {
    display: 'inline-block',
    padding: '1px 5px',
    fontSize: 9,
    fontWeight: 500,
    borderRadius: 2,
    marginRight: 3,
    marginBottom: 2,
  },
  anomalyBadge: {
    display: 'inline-block',
    padding: '1px 5px',
    fontSize: 9,
    fontWeight: 600,
    borderRadius: 2,
    marginRight: 4,
  },
  weeklySection: {
    padding: 'var(--space-2) 10px',
    borderRadius: 4,
    border: '1px solid rgba(10,132,255,0.12)',
    background: 'rgba(10,132,255,0.04)',
  },
  weeklyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  weeklyTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--color-accent)',
  },
  weeklyMeta: {
    fontSize: 9,
    color: 'var(--color-text-tertiary)',
  },
  weeklyStatRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 6,
  },
  weeklyStat: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  weeklyStatValue: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  weeklyStatLabel: {
    fontSize: 8,
    color: 'var(--color-text-tertiary)',
  },
  topAppRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 0',
  },
  topAppBar: {
    height: 4,
    borderRadius: 2,
    background: 'var(--color-accent)',
    transition: 'width 0.3s ease',
    minWidth: 4,
  },
  topAppName: {
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    minWidth: 60,
    flexShrink: 0,
  },
  topAppCount: {
    fontSize: 9,
    color: 'var(--color-text-tertiary)',
    fontFamily: 'monospace',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  actionBtn: {
    padding: '3px var(--space-2)',
    fontSize: 10,
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
    marginTop: 4,
  },
  refreshBtn: {
    padding: '3px var(--space-2)',
    fontSize: 10,
    border: '1px solid rgba(10,132,255,0.2)',
    borderRadius: 4,
    background: 'rgba(10,132,255,0.06)',
    color: 'var(--color-accent)',
    cursor: 'pointer',
  },
  emptyText: {
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    fontStyle: 'italic' as const,
    padding: 4,
  },
};

// ---------------------------------------------------------------------------
// Insight Type Config
// ---------------------------------------------------------------------------

const INSIGHT_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  session_summary: { color: 'var(--color-accent)', bgColor: 'rgba(10,132,255,0.15)', label: 'S' },
  most_used: { color: 'var(--color-warning)', bgColor: 'rgba(255,214,10,0.15)', label: 'U' },
  unfinished: { color: 'var(--color-warning)', bgColor: 'rgba(255,159,10,0.15)', label: '!' },
  pattern: { color: '#5e5ce6', bgColor: 'rgba(94,92,230,0.15)', label: 'P' },
  suggestion: { color: '#ff375f', bgColor: 'rgba(255,55,95,0.15)', label: '?' },
};

const SEVERITY_COLORS: Record<string, { color: string; bgColor: string }> = {
  low: { color: 'var(--color-accent)', bgColor: 'rgba(10,132,255,0.15)' },
  medium: { color: 'var(--color-warning)', bgColor: 'rgba(255,159,10,0.15)' },
  high: { color: '#ff375f', bgColor: 'rgba(255,55,95,0.15)' },
};

// ---------------------------------------------------------------------------
// Insight Card
// ---------------------------------------------------------------------------

const InsightCard = memo(({ insight }: { insight: JournalInsight }) => {
  const config = INSIGHT_CONFIG[insight.type] || INSIGHT_CONFIG.suggestion;

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ ...S.insightIcon, background: config.bgColor, color: config.color }}>
          {config.label}
        </span>
        <span style={S.cardTitle}>{insight.title}</span>
      </div>
      <div style={S.cardBody}>{insight.description}</div>
      {insight.type === 'most_used' && insight.data && Array.isArray(insight.data) && (
        <div style={{ marginTop: 4 }}>
          {(insight.data as { app: string; count: number }[]).slice(0, 5).map((item, i) => {
            const maxCount = insight.data[0]?.count || 1;
            const widthPct = Math.round((item.count / maxCount) * 100);
            return (
              <div key={i} style={S.topAppRow}>
                <span style={S.topAppName}>{item.app}</span>
                <div style={{ flex: 1, background: 'var(--color-border-subtle)', borderRadius: 2, height: 4 }}>
                  <div style={{ ...S.topAppBar, width: `${widthPct}%` }} />
                </div>
                <span style={S.topAppCount}>{item.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Pattern Card
// ---------------------------------------------------------------------------

const PatternCard = memo(({ pattern }: { pattern: CrossAppPattern }) => (
  <div style={S.card}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 4 }}>
      {pattern.apps.map((app, i) => (
        <React.Fragment key={i}>
          <span style={{ ...S.patternPill, background: 'rgba(94,92,230,0.12)', color: '#5e5ce6' }}>
            {app}
          </span>
          {i < pattern.apps.length - 1 && (
            <span style={{ fontSize: 9, color: 'var(--color-border)', alignSelf: 'center' }}>{'>'}</span>
          )}
        </React.Fragment>
      ))}
    </div>
    <div style={S.cardBody}>
      {pattern.frequency}x detected -- avg {Math.round(pattern.averageGapMs / 1000)}s between
    </div>
  </div>
));

// ---------------------------------------------------------------------------
// Anomaly Card
// ---------------------------------------------------------------------------

const AnomalyCard = memo(({ anomaly }: { anomaly: UsageAnomaly }) => {
  const severity = SEVERITY_COLORS[anomaly.severity] || SEVERITY_COLORS.low;

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <span style={{ ...S.anomalyBadge, background: severity.bgColor, color: severity.color }}>
          {anomaly.severity.toUpperCase()}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'capitalize' as const }}>
          {anomaly.type.replace(/_/g, ' ')}
        </span>
      </div>
      <div style={S.cardBody}>{anomaly.description}</div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Weekly Report Section
// ---------------------------------------------------------------------------

const WeeklyReportSection = memo(({ report }: { report: WeeklyReport }) => {
  const [expanded, setExpanded] = useState(false);

  const periodLabel = `${new Date(report.periodStart).toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${new Date(report.periodEnd).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;

  return (
    <div style={S.weeklySection}>
      <div style={S.weeklyHeader}>
        <span style={S.weeklyTitle}>Weekly Report</span>
        <span style={S.weeklyMeta}>{periodLabel}</span>
      </div>

      <div style={S.weeklyStatRow}>
        <div style={S.weeklyStat}>
          <span style={S.weeklyStatValue}>{report.totalEntries}</span>
          <span className="dex-caps" style={S.weeklyStatLabel}>Entries</span>
        </div>
        <div style={S.weeklyStat}>
          <span style={S.weeklyStatValue}>{report.uniqueApps}</span>
          <span className="dex-caps" style={S.weeklyStatLabel}>Apps</span>
        </div>
        <div style={S.weeklyStat}>
          <span style={S.weeklyStatValue}>{report.averageEntriesPerDay}</span>
          <span className="dex-caps" style={S.weeklyStatLabel}>Avg/Day</span>
        </div>
        <div style={S.weeklyStat}>
          <span style={S.weeklyStatValue}>{report.uniqueSessions}</span>
          <span className="dex-caps" style={S.weeklyStatLabel}>Sessions</span>
        </div>
      </div>

      {report.topApps.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          {report.topApps.slice(0, 5).map((app, i) => (
            <div key={i} style={S.topAppRow}>
              <span style={S.topAppName}>{app.app}</span>
              <div style={{ flex: 1, background: 'var(--color-border-subtle)', borderRadius: 2, height: 4 }}>
                <div style={{ ...S.topAppBar, width: `${app.percentage}%` }} />
              </div>
              <span style={S.topAppCount}>{app.percentage}%</span>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          {report.peakDay && (
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>
              Peak: {report.peakDay.date} ({report.peakDay.count} entries)
            </div>
          )}
          {report.quietDay && report.quietDay.date !== report.peakDay?.date && (
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>
              Quietest: {report.quietDay.date} ({report.quietDay.count} entries)
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'pre-wrap' as const, lineHeight: '1.5', marginTop: 6 }}>
            {report.summary}
          </div>
        </div>
      )}

      <button style={S.actionBtn} onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Show less' : 'Show details'}
      </button>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main JournalInsights Component
// ---------------------------------------------------------------------------

const JournalInsights: React.FC = () => {
  const {
    insights,
    weeklyReport,
    patterns,
    anomalies,
    insightsLoading,
    analysisLoading,
    loadInsights,
    loadWeeklyReport,
    loadPatterns,
    loadAnomalies,
    runAnalysis,
  } = useJournalStore();

  useEffect(() => {
    loadInsights();
    loadWeeklyReport();
    loadPatterns();
    loadAnomalies();
  }, [loadInsights, loadWeeklyReport, loadPatterns, loadAnomalies]);

  const handleRefreshAnalysis = () => {
    runAnalysis('all');
  };

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Insights</span>
        <button style={S.refreshBtn} onClick={handleRefreshAnalysis} disabled={analysisLoading}>
          {analysisLoading ? 'Analyzing...' : 'Refresh'}
        </button>
      </div>

      {/* Contextual Insights */}
      {insights.length > 0 && (
        <div>
          <div className="dex-caps" style={S.sectionTitle}>Context</div>
          {insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      )}

      {insights.length === 0 && !insightsLoading && (
        <div style={S.emptyText}>No contextual insights yet. Use DEX apps to generate activity.</div>
      )}

      {/* Weekly Report */}
      {weeklyReport && (
        <div>
          <div className="dex-caps" style={S.sectionTitle}>Weekly Report</div>
          <WeeklyReportSection report={weeklyReport} />
        </div>
      )}

      {/* Patterns */}
      {patterns.length > 0 && (
        <div>
          <div className="dex-caps" style={S.sectionTitle}>Detected Patterns</div>
          {patterns.slice(0, 5).map((pattern, i) => (
            <PatternCard key={i} pattern={pattern} />
          ))}
          {patterns.length > 5 && (
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textAlign: 'center' as const, padding: 4 }}>
              +{patterns.length - 5} more patterns
            </div>
          )}
        </div>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div>
          <div className="dex-caps" style={S.sectionTitle}>Usage Anomalies</div>
          {anomalies.slice(0, 5).map((anomaly, i) => (
            <AnomalyCard key={i} anomaly={anomaly} />
          ))}
        </div>
      )}

      {/* Empty analysis state */}
      {!weeklyReport && patterns.length === 0 && anomalies.length === 0 && !analysisLoading && (
        <div style={S.emptyText}>Analysis data not available yet. Reports generate automatically once enough activity is recorded.</div>
      )}

      {insightsLoading && (
        <div style={S.emptyText}>Loading insights...</div>
      )}
    </div>
  );
};

export default JournalInsights;
